import AVFoundation
import Foundation
import NitroModules

typealias InputLevelListener = (Double) -> Void
typealias WarningCallback = (AudioSessionWarning) -> Void

struct Listener<T> {
  let id: Double
  let callback: T
}

@objcMembers
class SimpleAudioInput: HybridSimpleAudioInputSpec {

  // MARK: Initialization

  private var inputLevelListeners: [Listener<InputLevelListener>] = []
  private var nextListenerId: Double = 0

  private let audioSession = AVAudioSession.sharedInstance()

  private var inputLevelEngine = AVAudioEngine()
  private var isTappingInputLevel = false

  override init() {
    super.init()
    registerListeners()
  }

  deinit {
    unregisterListeners()
    stopInputLevelTap()
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
}
