package com.margelo.nitro.simpleaudioconfig
  
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class SimpleAudioConfig : HybridSimpleAudioConfigSpec() {
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }
}
