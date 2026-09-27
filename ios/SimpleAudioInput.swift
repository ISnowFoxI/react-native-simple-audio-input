import AVFoundation
import Foundation
import NitroModules

typealias InputLevelListener = (Double) -> Void
typealias RouteChangeListener = () -> Void
typealias WarningCallback = (AudioSessionWarning) -> Void

struct Listener<T> {
  let id: Double
  let callback: T
}

enum AudioSessionError: Error {
  case error(name: String, message: String)
}

@objcMembers
class SimpleAudioInput: HybridSimpleAudioInputSpec {

  // MARK: Initialization

  private var inputLevelListeners: [Listener<InputLevelListener>] = []
  private var routeChangeListeners: [Listener<RouteChangeListener>] = []
  private var nextListenerId: Double = 0

  private let audioSession = AVAudioSession.sharedInstance()
  private var isSessionActive = false

  private var inputLevelEngine = AVAudioEngine()
  private var isTappingInputLevel = false

  override init() {
    super.init()
    registerListeners()
  }

  deinit {
    unregisterListeners()
    stopInputLevelTap()
    routeChangeListeners.removeAll()
  }

  private func registerListeners() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleWillEnterForeground),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
  }

  private func unregisterListeners() {
    NotificationCenter.default.removeObserver(
      self, name: AVAudioSession.interruptionNotification, object: nil)
    NotificationCenter.default.removeObserver(
      self, name: AVAudioSession.routeChangeNotification, object: nil)
    NotificationCenter.default.removeObserver(
      self, name: UIApplication.willEnterForegroundNotification, object: nil)
    NotificationCenter.default.removeObserver(
      self, name: UIApplication.didEnterBackgroundNotification, object: nil)
  }

  // MARK: Notification handlers

  @objc private func handleWillEnterForeground(_ notification: Notification) {
    resumeInputLevelEngineIfNeeded()
  }

  @objc private func handleDidEnterBackground(_ notification: Notification) {
    // The system deactivates the session on background; resync our cached
    // flag so a subsequent `activate()` actually reactivates rather than
    // silently no-op'ing because it thinks the session is still active.
    isSessionActive = false
    pauseInputLevelEngineIfNeeded()
  }

  @objc private func handleInterruption(_ note: Notification) {
    guard
      let userInfo = note.userInfo,
      let rawType = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt
    else {
      return
    }

    switch AVAudioSession.InterruptionType(rawValue: rawType) {
    case .began:
      pauseInputLevelEngineIfNeeded()
    case .ended:
      resumeInputLevelEngineIfNeeded()
    default:
      break
    }
  }

  @objc private func handleRouteChange(_ note: Notification) {
    guard
      let userInfo = note.userInfo,
      let rawReason = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt
    else {
      return
    }

    // The input node's format can change with the route (e.g. switching mics),
    // so the tap needs to be torn down and reinstalled against the new route.
    if isTappingInputLevel, AVAudioSession.RouteChangeReason(rawValue: rawReason) != .unknown {
      restartInputLevelTap()
    }

    routeChangeListeners.forEach { $0.callback() }
  }

  // MARK: Route change

  func addRouteChangeListener(callback: @escaping RouteChangeListener) throws -> Double {
    let listener = Listener(id: nextListenerId, callback: callback)
    routeChangeListeners.append(listener)
    nextListenerId += 1
    return listener.id
  }

  func removeRouteChangeListener(id: Double) throws {
    routeChangeListeners.removeAll { $0.id == id }
  }

  // MARK: Input level metering

  func addInputLevelListener(callback: @escaping InputLevelListener) throws -> Double {
    let listener = Listener(id: nextListenerId, callback: callback)
    inputLevelListeners.append(listener)
    nextListenerId += 1

    if !isTappingInputLevel {
      startInputLevelTap()
    }

    return listener.id
  }

  func removeInputLevelListener(id: Double) throws {
    inputLevelListeners.removeAll { $0.id == id }

    if inputLevelListeners.isEmpty {
      stopInputLevelTap()
    }
  }

  // Taps the raw input node so metering always reflects whatever input is
  // currently active (including one selected via `setPreferredAudioInput`).
  private func startInputLevelTap() {
    // Rebuilt fresh each time: reusing a previously-stopped engine across a
    // route change is unreliable once its input node's format has changed.
    inputLevelEngine = AVAudioEngine()
    let inputNode = inputLevelEngine.inputNode
    let format = inputNode.inputFormat(forBus: 0)

    guard format.sampleRate > 0 else {
      // No input hardware available yet (e.g. session not configured for recording).
      return
    }

    inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      let level = Self.soundLevel(from: buffer)
      DispatchQueue.main.async {
        self?.inputLevelListeners.forEach { $0.callback(Double(level)) }
      }
    }

    do {
      try inputLevelEngine.start()
      isTappingInputLevel = true
    } catch {
      inputNode.removeTap(onBus: 0)
      print("Failed to start audio engine for input level metering: \(error.localizedDescription)")
    }
  }

  private func stopInputLevelTap() {
    guard isTappingInputLevel else { return }
    inputLevelEngine.inputNode.removeTap(onBus: 0)
    inputLevelEngine.stop()
    isTappingInputLevel = false
  }

  private func restartInputLevelTap() {
    inputLevelEngine.stop()
    inputLevelEngine.inputNode.removeTap(onBus: 0)
    startInputLevelTap()
  }

  private func pauseInputLevelEngineIfNeeded() {
    guard isTappingInputLevel, inputLevelEngine.isRunning else { return }
    inputLevelEngine.pause()
  }

  private func resumeInputLevelEngineIfNeeded() {
    guard isTappingInputLevel, !inputLevelEngine.isRunning else { return }
    try? inputLevelEngine.start()
  }

  // Roughly a 0-100 dB-above-noise-floor scale: silence reads ~0, full-scale reads ~100.
  private static func soundLevel(from buffer: AVAudioPCMBuffer) -> Float {
    guard let channelData = buffer.floatChannelData else { return 0 }
    let frameLength = Int(buffer.frameLength)
    guard frameLength > 0 else { return 0 }

    let samples = channelData[0]
    var sum: Float = 0
    for i in 0..<frameLength {
      sum += samples[i] * samples[i]
    }
    let rms = sqrt(sum / Float(frameLength) + Float.ulpOfOne)
    let level = 20 * log10(rms)
    return max(level + 100, 0)
  }

  // MARK: Input selection

  public func getAvailableAudioInputs() throws -> [PortDescription] {
    return (audioSession.availableInputs ?? []).map(serializePort)
  }

  public func setPreferredAudioInput(port: PortDescription, warningCallback: @escaping WarningCallback) {
    guard let match = audioSession.availableInputs?.first(where: { $0.uid == port.uid }) else {
      warningCallback(
        AudioSessionWarning(
          name: "FAILED_TO_SET_PREFERRED_AUDIO_INPUT",
          message: "Preferred audio input not found among available inputs, falling back to default audio input"
        ))
      return
    }
    do {
      try audioSession.setPreferredInput(match)
    } catch {
      warningCallback(
        AudioSessionWarning(
          name: "FAILED_TO_SET_PREFERRED_AUDIO_INPUT",
          message: "Failed to set preferred audio input, falling back to default audio input"
        ))
    }
  }

  private func serializePort(_ port: AVAudioSessionPortDescription) -> PortDescription {
    let channels: [Double]? = port.channels?.map { Double($0.channelNumber) }

    let selectedDataSourceId: String? = {
      if let dataSourceID = port.selectedDataSource?.dataSourceID {
        return dataSourceID.stringValue
      }
      return nil
    }()

    let isDataSourceSupported = port.dataSources != nil

    return PortDescription(
      portName: port.portName,
      portType: readablePortType(for: port.portType),
      uid: port.uid,
      channels: channels,
      isDataSourceSupported: isDataSourceSupported,
      selectedDataSourceId: selectedDataSourceId
    )
  }

  private func readablePortType(for port: AVAudioSession.Port) -> PortType {
    switch port {
    case .builtInMic:
      return .builtinmic
    case .headsetMic:
      return .headsetmic
    case .lineIn:
      return .linein
    case .AVB:
      return .avb
    case .PCI:
      return .pci
    case .bluetoothHFP:
      return .bluetoothhfp
    case .carAudio:
      return .caraudio
    case .displayPort:
      return .displayport
    case .fireWire:
      return .firewire
    case .thunderbolt:
      return .thunderbolt
    case .usbAudio:
      return .usbaudio
    case .virtual:
      return .virtual
    default:
      if #available(iOS 17.0, *), port == .continuityMicrophone {
        return .continuitymicrophone
      }
      return .unknown
    }
  }

  // MARK: Session configuration & activation

  public func activate(warningCallback: @escaping WarningCallback) throws -> Promise<Void> {
    return Promise.async {
      do {
        if !self.isSessionActive {
          try self.audioSession.setActive(true)
          self.isSessionActive = true
        } else {
          warningCallback(
            AudioSessionWarning(
              name: "MULTIPLE_ACTIVATION_WARNING",
              message: "Activation function called while the session was already active. Did you mean to do this?"
            ))
        }
      } catch {
        throw AudioSessionError.error(
          name: "ACTIVATION_FAILURE",
          message: "Failed to activate audio session with error: \(error.localizedDescription)"
        )
      }
    }
  }

  public func configureAudioSession(
    category categoryName: String,
    mode modeName: String,
    policy policyName: String,
    categoryOptions optionsArray: [String],
    prefersNoInterruptionFromSystemAlerts: Bool,
    prefersInterruptionOnRouteDisconnect: Bool,
    allowHapticsAndSystemSoundsDuringRecording: Bool,
    prefersEchoCancelledInput: Bool,
    warningCallback: @escaping WarningCallback
  ) throws {
    let category: AVAudioSession.Category = try {
      switch categoryName {
      case "Ambient": return .ambient
      case "SoloAmbient": return .soloAmbient
      case "Playback": return .playback
      case "Record": return .record
      case "PlayAndRecord": return .playAndRecord
      case "MultiRoute": return .multiRoute
      default:
        throw AudioSessionError.error(
          name: "INVALID_CATEGORY",
          message: "Unknown category: \(categoryName)"
        )
      }
    }()

    let mode: AVAudioSession.Mode = try {
      switch modeName {
      case "Default": return .default
      case "VoiceChat": return .voiceChat
      case "VideoChat": return .videoChat
      case "GameChat": return .gameChat
      case "VideoRecording": return .videoRecording
      case "Measurement": return .measurement
      case "MoviePlayback": return .moviePlayback
      case "SpokenAudio": return .spokenAudio
      case "VoicePrompt": return .voicePrompt
      default:
        throw AudioSessionError.error(
          name: "INVALID_MODE",
          message: "Unknown mode: \(modeName)"
        )
      }
    }()

    let policy: AVAudioSession.RouteSharingPolicy = {
      switch policyName {
      case "LongFormAudio": return .longFormAudio
      case "LongFormVideo": return .longFormVideo
      case "Independent": return .independent
      default: return .default
      }
    }()

    var options: AVAudioSession.CategoryOptions = []
    for optionName in optionsArray {
      switch optionName {
      case "MixWithOthers":
        guard
          category == .playAndRecord || category == .playback || category == .multiRoute
            || category == .ambient
        else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "MixWithOthers is not supported for category \(categoryName)"
          )
        }
        options.insert(.mixWithOthers)
      case "AllowBluetoothHFP":
        guard category == .playAndRecord || category == .record else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "AllowBluetoothHFP is not supported for category \(categoryName)"
          )
        }
        options.insert(.allowBluetoothHFP)
      case "AllowBluetoothA2DP":
        if category == .playAndRecord {
          options.insert(.allowBluetoothA2DP)
        } else if category == .playback || category == .soloAmbient || category == .ambient {
          warningCallback(
            AudioSessionWarning(
              name: "OPTION_NOT_APPLIED",
              message: "AllowBluetoothA2DP is applied by default for category \(categoryName)."
            ))
        } else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "AllowBluetoothA2DP is not supported for category \(categoryName)"
          )
        }
      case "AllowAirPlay":
        guard category == .playAndRecord else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "AllowAirPlay is not supported for category \(categoryName)"
          )
        }
        options.insert(.allowAirPlay)
      case "DuckOthers":
        guard category == .playAndRecord || category == .playback || category == .multiRoute else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "DuckOthers is not supported for category \(categoryName)"
          )
        }
        options.insert(.duckOthers)
      case "DefaultToSpeaker":
        guard category == .playAndRecord else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "DefaultToSpeaker is not supported for category \(categoryName)"
          )
        }
        options.insert(.defaultToSpeaker)
      case "InterruptSpokenAudioAndMixWithOthers":
        guard category == .playAndRecord || category == .playback || category == .multiRoute else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "InterruptSpokenAudioAndMixWithOthers is not supported for category \(categoryName)"
          )
        }
        options.insert(.interruptSpokenAudioAndMixWithOthers)
      case "OverrideMutedMicrophoneInterruption":
        guard #available(iOS 16.0, *), category == .playAndRecord || category == .record else {
          throw AudioSessionError.error(
            name: "UNSUPPORTED_CATEGORY_OPTION",
            message: "OverrideMutedMicrophoneInterruption requires iOS 16.0+ and category PlayAndRecord or Record."
          )
        }
        options.insert(.overrideMutedMicrophoneInterruption)
      default:
        throw AudioSessionError.error(
          name: "INVALID_CATEGORY_OPTION",
          message: "Unknown category option: \(optionName)"
        )
      }
    }

    do {
      try audioSession.setCategory(category, mode: mode, policy: policy, options: options)
    } catch {
      if error.localizedDescription.contains("The operation couldn't be completed") {
        throw AudioSessionError.error(
          name: "MICROPHONE_IN_USE",
          message: "Failed to configure audio session: \(error.localizedDescription)"
        )
      } else {
        throw AudioSessionError.error(
          name: "INVALID_CONFIGURATION",
          message: "Failed to set category: \(error.localizedDescription)"
        )
      }
    }

    do {
      try audioSession.setPrefersNoInterruptionsFromSystemAlerts(prefersNoInterruptionFromSystemAlerts)
    } catch {
      warningCallback(
        AudioSessionWarning(
          name: "PREFERENCE_FAILURE_NO_INTERRUPTIONS",
          message: "Failed to set prefersNoInterruptionFromSystemAlerts: \(error.localizedDescription)"
        ))
    }

    do {
      try audioSession.setAllowHapticsAndSystemSoundsDuringRecording(allowHapticsAndSystemSoundsDuringRecording)
    } catch {
      warningCallback(
        AudioSessionWarning(
          name: "PREFERENCE_FAILURE_HAPTICS",
          message: "Failed to set allowHapticsAndSystemSoundsDuringRecording: \(error.localizedDescription)"
        ))
    }

    if #available(iOS 17.0, *) {
      do {
        try audioSession.setPrefersInterruptionOnRouteDisconnect(prefersInterruptionOnRouteDisconnect)
      } catch {
        warningCallback(
          AudioSessionWarning(
            name: "PREFERENCE_FAILURE_ROUTE_DISCONNECT",
            message: "Failed to set prefersInterruptionOnRouteDisconnect: \(error.localizedDescription)"
          ))
      }
    } else if prefersInterruptionOnRouteDisconnect {
      warningCallback(
        AudioSessionWarning(
          name: "PREFERENCE_FAILURE_ROUTE_DISCONNECT",
          message: "Setting prefersInterruptionOnRouteDisconnect requires iOS 17 or later"
        ))
    }

    if prefersEchoCancelledInput {
      if #available(iOS 18.2, *) {
        if category != .playAndRecord {
          warningCallback(
            AudioSessionWarning(
              name: "PREFERENCE_WARNING_ECHO_CANCELLATION",
              message: "Setting prefersEchoCancelledInput requires category PlayAndRecord, but found \(categoryName)"
            ))
        } else if mode != .default {
          warningCallback(
            AudioSessionWarning(
              name: "PREFERENCE_WARNING_ECHO_CANCELLATION",
              message: "Setting prefersEchoCancelledInput requires mode Default, but found \(modeName)"
            ))
        } else if !audioSession.isEchoCancelledInputAvailable {
          warningCallback(
            AudioSessionWarning(
              name: "PREFERENCE_WARNING_ECHO_CANCELLATION",
              message: "Setting prefersEchoCancelledInput requires hardware support for echo cancellation, which is not available on this device"
            ))
        } else {
          do {
            try audioSession.setPrefersEchoCancelledInput(prefersEchoCancelledInput)
          } catch {
            warningCallback(
              AudioSessionWarning(
                name: "PREFERENCE_WARNING_ECHO_CANCELLATION",
                message: "Failed to set prefersEchoCancelledInput: \(error.localizedDescription)"
              ))
          }
        }
      } else {
        warningCallback(
          AudioSessionWarning(
            name: "PREFERENCE_WARNING_ECHO_CANCELLATION",
            message: "Setting prefersEchoCancelledInput requires iOS 18.2 or later"
          ))
      }
    }
  }
}
