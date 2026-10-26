$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @"
using System;
using System.IO;
using System.Collections.Generic;
using System.Speech.Synthesis;
public class Cue { public double time; public int id; }
public class SpeechResult { public string audioBase64; public Cue[] visemes; public string voice; }
public static class InterviewSpeech {
 public static SpeechResult Generate(string text) {
  using(var synth = new SpeechSynthesizer()) using(var stream = new MemoryStream()) {
   synth.SelectVoiceByHints(VoiceGender.Female,VoiceAge.Adult,0,new System.Globalization.CultureInfo("en-US"));
   synth.Rate = -1;
   var cues = new List<Cue>();
   // AudioPosition drifts later by ~35 ms per event (about 1.25-1.3x by the end of a question).
   // Viseme durations sum exactly to the WAV length, so cue times are their running total.
   double position = 0;
   synth.VisemeReached += (sender,e) => { lock(cues) { cues.Add(new Cue {time=position,id=e.Viseme}); position += e.Duration.TotalSeconds; } };
   synth.SetOutputToWaveStream(stream);
   synth.Speak(text);
   synth.SetOutputToNull();
   return new SpeechResult {audioBase64=Convert.ToBase64String(stream.ToArray()),visemes=cues.ToArray(),voice=synth.Voice.Name};
  }
 }
}
"@
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
[InterviewSpeech]::Generate($inputData.text) | ConvertTo-Json -Depth 4 -Compress
