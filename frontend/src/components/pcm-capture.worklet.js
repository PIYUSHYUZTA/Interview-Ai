// PCM capture runs on the audio rendering thread. Output stays silent.
class InterviewPCM extends AudioWorkletProcessor {
  process(inputs) {
    const channel=inputs[0]?.[0];
    if(channel)this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor('interview-pcm',InterviewPCM);
