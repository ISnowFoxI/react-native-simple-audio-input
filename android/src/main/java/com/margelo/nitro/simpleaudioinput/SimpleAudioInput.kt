package com.margelo.nitro.simpleaudioinput

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.*
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

private const val LEVEL_SAMPLE_RATE = 44100

data class Listener<T>(
  val id: Double,
  val callback: T
)

private val SUPPORTED_INPUT_TYPES = setOf(
  AudioDeviceInfo.TYPE_BUILTIN_MIC,
  AudioDeviceInfo.TYPE_WIRED_HEADSET,
  AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
  AudioDeviceInfo.TYPE_BLE_HEADSET,
  AudioDeviceInfo.TYPE_USB_DEVICE,
  AudioDeviceInfo.TYPE_USB_HEADSET,
  AudioDeviceInfo.TYPE_USB_ACCESSORY,
  AudioDeviceInfo.TYPE_LINE_ANALOG,
  AudioDeviceInfo.TYPE_HEARING_AID
)

@DoNotStrip
class SimpleAudioInput : HybridSimpleAudioInputSpec() {
  private var nextListenerId = 0.0
  private val inputLevelListeners = mutableListOf<Listener<(Double) -> Unit>>()
  private val routeChangeListeners = mutableListOf<Listener<() -> Unit>>()
  private var hasSetCommunicationDevice = false
  private var selectedInputDevice: AudioDeviceInfo? = null

  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile private var isTappingInputLevel = false
  private var levelRecord: AudioRecord? = null
  private var levelThread: Thread? = null

  private val audioManager: AudioManager?
    get() =
      NitroModules.applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  // Fans out to routeChangeListeners, mirroring the iOS route-change notification.
  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      restartInputLevelTapIfNeeded()
      routeChangeListeners.forEach { it.callback() }
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      if (removedDevices.any { it.id == selectedInputDevice?.id }) {
        // The selected input disappeared - fall back to the default input, same as the
        // platform does for setCommunicationDevice/output routing.
        selectedInputDevice = null
      }
      restartInputLevelTapIfNeeded()
      routeChangeListeners.forEach { it.callback() }
    }
  }

  init {
    audioManager?.registerAudioDeviceCallback(deviceCallback, mainHandler)
  }

  override fun dispose() {
    audioManager?.let { manager ->
      manager.unregisterAudioDeviceCallback(deviceCallback)
      if (hasSetCommunicationDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        manager.clearCommunicationDevice()
        manager.mode = AudioManager.MODE_NORMAL
      }
    }
    stopInputLevelTap()
    inputLevelListeners.clear()
    routeChangeListeners.clear()
    super.dispose()
  }

  // MARK: Input selection

  override fun getAvailableAudioInputs(): Array<PortDescription> {
    val devices = audioManager?.getDevices(AudioManager.GET_DEVICES_INPUTS) ?: arrayOf()
    // GET_DEVICES_INPUTS also returns non-mic input routes (TELEPHONY, FM_TUNER,
    // REMOTE_SUBMIX, ECHO_REFERENCE, ...). Those report the phone's generic product name,
    // so left unfiltered they show up as several indistinguishable "duplicate" mic entries.
    // Only surface types a caller could actually want to pick as a mic.
    //
    // The platform can also report the same physical mic multiple times - once per internal
    // audio-policy "mix port" use case (call, camcorder, voice recognition, etc.), or once per
    // physical capsule on multi-mic phones (primary/secondary noise-cancelling mic) - each with
    // a distinct id/address. There's no public API to let a caller pick between built-in
    // capsules (unlike external accessories, which can legitimately be multiple distinct
    // devices at once), so collapse all built-in mic entries into one; dedupe everything else
    // by its address.
    return devices
      .filter { SUPPORTED_INPUT_TYPES.contains(it.type) }
      .distinctBy { device ->
        if (device.type == AudioDeviceInfo.TYPE_BUILTIN_MIC) device.type to ""
        else device.type to device.address
      }
      .map(::serializePort)
      .toTypedArray()
  }

  override fun setPreferredAudioInput(
    port: PortDescription,
    warningCallback: (AudioSessionWarning) -> Unit
  ) {
    val manager = audioManager
    if (manager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      warningCallback(
        AudioSessionWarning(
          name = "FAILED_TO_SET_PREFERRED_AUDIO_INPUT",
          message = "Setting a preferred audio input requires Android 12 (API 31) or later"
        )
      )
      return
    }

    val inputDevice = manager.getDevices(AudioManager.GET_DEVICES_INPUTS)
      .firstOrNull { it.id.toString() == port.uid }
    if (inputDevice == null) {
      warningCallback(
        AudioSessionWarning(
          name = "FAILED_TO_SET_PREFERRED_AUDIO_INPUT",
          message = "Preferred audio input not found among available inputs, falling back to default audio input"
        )
      )
      return
    }

    // setCommunicationDevice() only accepts sink (output) devices - the platform pairs the
    // matching mic automatically once that route is selected. Map the chosen input to its
    // output-route counterpart (same AudioDeviceInfo.type for most devices; the built-in mic
    // has no direct counterpart and routes via the earpiece, falling back to the speaker on
    // devices without one).
    val candidateTypes = if (inputDevice.type == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
      listOf(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
    } else {
      listOf(inputDevice.type)
    }

    val routeDevice = manager.availableCommunicationDevices
      .firstOrNull { candidateTypes.contains(it.type) }
    if (routeDevice == null) {
      warningCallback(
        AudioSessionWarning(
          name = "FAILED_TO_SET_PREFERRED_AUDIO_INPUT",
          message = "Preferred audio input has no corresponding communication route on this device, falling back to default audio input"
        )
      )
      return
    }

    try {
      // setCommunicationDevice() only has a routing effect while the session is in a
      // communication-style mode.
      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      val success = manager.setCommunicationDevice(routeDevice)
      if (!success) {
        warningCallback(
          AudioSessionWarning(
            name = "FAILED_TO_SET_PREFERRED_AUDIO_INPUT",
            message = "Failed to set preferred audio input, falling back to default audio input"
          )
        )
        return
      }
      hasSetCommunicationDevice = true
      // Keep the level meter (a separate AudioRecord tap) pinned to the same physical
      // mic the caller just picked, independent of the communication-route hack above.
      selectedInputDevice = inputDevice
      restartInputLevelTapIfNeeded()
    } catch (e: IllegalArgumentException) {
      warningCallback(
        AudioSessionWarning(
          name = "FAILED_TO_SET_PREFERRED_AUDIO_INPUT",
          message = "Preferred audio input is no longer valid, falling back to default audio input"
        )
      )
    }
  }

  private fun serializePort(device: AudioDeviceInfo): PortDescription {
    val channels = device.channelCounts
      .takeIf { it.isNotEmpty() }
      ?.map { it.toDouble() }
      ?.toDoubleArray()

    return PortDescription(
      portName = device.productName?.toString() ?: "",
      portType = readablePortType(device.type),
      uid = device.id.toString(),
      channels = channels,
      isDataSourceSupported = null,
      selectedDataSourceId = null
    )
  }

  private fun readablePortType(type: Int): PortType {
    return when (type) {
      AudioDeviceInfo.TYPE_BUILTIN_MIC -> PortType.BUILTINMIC
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> PortType.HEADSETMIC
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> PortType.BLUETOOTHHFP
      AudioDeviceInfo.TYPE_BLE_HEADSET -> PortType.BLEHEADSET
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_ACCESSORY -> PortType.USBAUDIO
      AudioDeviceInfo.TYPE_LINE_ANALOG -> PortType.LINEIN
      AudioDeviceInfo.TYPE_HEARING_AID -> PortType.HEARINGAID
      else -> PortType.UNKNOWN
    }
  }

  // MARK: Input level metering

  override fun addInputLevelListener(callback: (Double) -> Unit): Double {
    val id = nextListenerId++
    inputLevelListeners += Listener(id, callback)

    if (!isTappingInputLevel) {
      startInputLevelTap()
    }

    return id
  }

  override fun removeInputLevelListener(id: Double) {
    inputLevelListeners.removeAll { it.id == id }

    if (inputLevelListeners.isEmpty()) {
      stopInputLevelTap()
    }
  }

  // Taps a dedicated AudioRecord so metering always reflects whatever input is currently
  // active (including one selected via `setPreferredAudioInput`), without disturbing any
  // recording a caller (e.g. vision-camera) is doing elsewhere. Requires RECORD_AUDIO -
  // silently does nothing if that permission hasn't been granted yet, mirroring iOS's
  // silent no-op when no input format is available.
  private fun startInputLevelTap() {
    val context = NitroModules.applicationContext ?: return
    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    val minBufferSizeBytes = AudioRecord.getMinBufferSize(
      LEVEL_SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    if (minBufferSizeBytes <= 0) return

    val record = try {
      AudioRecord(
        MediaRecorder.AudioSource.MIC,
        LEVEL_SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        minBufferSizeBytes * 2
      )
    } catch (e: SecurityException) {
      return
    }

    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      return
    }

    selectedInputDevice?.let { record.setPreferredDevice(it) }

    levelRecord = record
    isTappingInputLevel = true

    val frameChunk = minBufferSizeBytes / 2
    val thread = Thread {
      Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
      val buffer = ShortArray(frameChunk)
      try {
        record.startRecording()
        while (isTappingInputLevel) {
          val read = record.read(buffer, 0, buffer.size)
          if (read > 0) {
            val level = soundLevel(buffer, read)
            mainHandler.post {
              inputLevelListeners.forEach { it.callback(level) }
            }
          }
        }
      } catch (e: Exception) {
        // Capture failed (e.g. mic taken by a higher-priority client) - stop quietly.
      } finally {
        try {
          record.stop()
        } catch (e: IllegalStateException) {
          // Already stopped.
        }
        record.release()
      }
    }
    levelThread = thread
    thread.start()
  }

  private fun stopInputLevelTap() {
    isTappingInputLevel = false
    // Unblocks the worker thread's in-flight read() so it can exit its loop promptly;
    // the thread releases the record itself once it does.
    levelRecord?.let {
      try {
        it.stop()
      } catch (e: IllegalStateException) {
        // Already stopped.
      }
    }
    levelRecord = null
    levelThread = null
  }

  // The input node's format/routing can change with the route (e.g. switching mics), so
  // the tap needs to be torn down and reinstalled against the new one.
  private fun restartInputLevelTapIfNeeded() {
    if (!isTappingInputLevel) return
    stopInputLevelTap()
    startInputLevelTap()
  }

  // Roughly a 0-100 dB-above-noise-floor scale: silence reads ~0, full-scale reads ~100.
  private fun soundLevel(buffer: ShortArray, length: Int): Double {
    var sum = 0.0
    for (i in 0 until length) {
      val sample = buffer[i] / 32768.0
      sum += sample * sample
    }
    val rms = sqrt(sum / length + Double.MIN_VALUE)
    val level = 20 * log10(rms)
    return max(level + 100, 0.0)
  }

  // MARK: Route change

  override fun addRouteChangeListener(callback: () -> Unit): Double {
    val id = nextListenerId++
    routeChangeListeners += Listener(id, callback)
    return id
  }

  override fun removeRouteChangeListener(id: Double) {
    routeChangeListeners.removeAll { it.id == id }
  }

  // MARK: Session configuration & activation (not supported on Android yet)

  override fun configureAudioSession(
    category: String,
    mode: String,
    policy: String,
    categoryOptions: Array<String>,
    prefersNoInterruptionFromSystemAlerts: Boolean,
    prefersInterruptionOnRouteDisconnect: Boolean,
    allowHapticsAndSystemSoundsDuringRecording: Boolean,
    prefersEchoCancelledInput: Boolean,
    warningCallback: (AudioSessionWarning) -> Unit
  ) {
    // Not supported on Android yet.
  }

  override fun activate(warningCallback: (AudioSessionWarning) -> Unit): Promise<Unit> = Promise.async {
    // Not supported on Android yet.
  }
}
