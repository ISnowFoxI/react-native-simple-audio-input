package com.margelo.nitro.simpleaudioinput

import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.core.*

data class Listener<T>(
  val id: Double,
  val callback: T
)

@DoNotStrip
class SimpleAudioInput : HybridSimpleAudioInputSpec() {
  private var nextListenerId = 0.0
  private val inputLevelListeners = mutableListOf<Listener<(Double) -> Unit>>()

  override fun getAvailableAudioInputs(): Array<PortDescription> {
    // Not supported on Android yet.
    return arrayOf()
  }

  override fun setPreferredAudioInput(port: PortDescription, warningCallback: (AudioSessionWarning) -> Unit) {
    // Not supported on Android yet.
  }

  override fun addInputLevelListener(callback: (Double) -> Unit): Double {
    val id = nextListenerId++
    inputLevelListeners += Listener(id, callback)
    return id
  }

  override fun removeInputLevelListener(id: Double) {
    inputLevelListeners.removeAll { it.id == id }
  }
}
