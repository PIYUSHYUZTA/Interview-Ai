$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @"
using System;
using System.IO;
using System.Speech.Recognition;
public class RecognitionOutput { public string text; public double confidence; }
public static class InterviewRecognition {
 public static RecognitionOutput Decode(string audio) {
  using(var stream=new MemoryStream(Convert.FromBase64String(audio)))
  using(var engine=new SpeechRecognitionEngine(new System.Globalization.CultureInfo("en-US"))) {
   engine.LoadGrammar(new DictationGrammar());
   engine.SetInputToWaveStream(stream);
   var text=new System.Text.StringBuilder();double confidence=0;int count=0;
   RecognitionResult result;
   while(true){
    try { result=engine.Recognize(TimeSpan.FromSeconds(5)); }
    catch(InvalidOperationException) { if(stream.Position>=stream.Length)break;throw; }
    if(result==null)break;
    if(!string.IsNullOrWhiteSpace(result.Text)){text.Append(result.Text).Append(" ");confidence+=result.Confidence;count++;}
   }
   return new RecognitionOutput{text=text.ToString().Trim(),confidence=count==0?0:confidence/count};
  }
 }
}
"@
$inputData=[Console]::In.ReadToEnd() | ConvertFrom-Json
[InterviewRecognition]::Decode($inputData.audioBase64) | ConvertTo-Json -Compress
