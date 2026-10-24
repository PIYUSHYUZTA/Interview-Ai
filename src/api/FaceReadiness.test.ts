import { describe, expect, it } from 'vitest';
import { FaceReadiness } from './FaceReadiness.js';
import { VisionObservationSchema } from './ProctoringWorker.js';
const good = VisionObservationSchema.parse({ faceState:'FACE_PRESENT',faceTrackingReliable:true,faceCount:1,faceTracks:[{trackId:1,center:[.5,.5],bounds:[.2,.2,.8,.8]}],faceQuality:{checks:{singleFace:true,largeEnough:true,wellLit:true,sharpEnough:true,forwardFacing:true},score:1,method:'image-and-geometry-checks',detectorConfidence:null},headOrientation:'roughly_forward',gazeDirection:'roughly_centered',upperBodyVisible:true,upperBodyMovement:null,handCount:0,handPositions:[],handMovement:null });
describe('anonymous face readiness',()=>{
  it('requires two good samples of the same anonymous track and expires without claiming identity',()=>{
    const gate=new FaceReadiness();expect(gate.get('a',100).ready).toBe(false);
    expect(gate.record('a',good,100).ready).toBe(false);expect(gate.record('a',good,2100)).toMatchObject({ready:true,identityVerified:false});
    expect(gate.get('b',2200).ready).toBe(false);expect(gate.get('a',33000)).toMatchObject({ready:false,state:'TRACKING_LOST'});
    expect(gate.get('a',9000001).state).toBe('NOT_CHECKED');
  });
  it('rejects missing, multiple, low-quality faces and interrupted tracks; supports deletion',()=>{
    const gate=new FaceReadiness();gate.record('a',good,100);
    expect(gate.record('a',{...good,faceState:'QUALITY_LOW'},2100).ready).toBe(false);
    expect(gate.record('a',{...good,faceState:'MULTIPLE_FACES',faceCount:2},4100).ready).toBe(false);
    expect(gate.record('a',{...good,faceState:'FACE_NOT_DETECTED',faceCount:0},6100).ready).toBe(false);
    gate.record('a',good,8100);expect(gate.record('a',good,16100).ready).toBe(false);
    gate.clear('a');expect(gate.get('a',17000).state).toBe('NOT_CHECKED');
  });
  it('requires fresh consistent samples after a track change or technical failure',()=>{
    const gate = new FaceReadiness(), now = Date.now();
    gate.record('candidate', good, now);
    expect(gate.record('candidate', good, now+2000).ready).toBe(true);
    const changed = {...good, faceTracks: [{...good.faceTracks[0], trackId: 2}]};
    expect(gate.record('candidate', changed, now+4000)).toMatchObject({ready:false,goodSamples:1});
    gate.unavailable('candidate');
    expect(gate.get('candidate')).toMatchObject({ready:false,state:'UNAVAILABLE',identityVerified:false});
    expect(gate.record('candidate', changed, now+5000)).toMatchObject({ready:false,goodSamples:1});
    expect(gate.record('candidate', changed, now+7000)).toMatchObject({ready:true,identityVerified:false});
    expect(gate.get('another-candidate',now+7000).ready).toBe(false);
  });
});
