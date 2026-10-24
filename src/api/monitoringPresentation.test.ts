import {describe,expect,it} from 'vitest';
import {monitoringPresentation} from '../../frontend/src/components/monitoringPresentation.js';
import type {VisionObservation,FaceReadinessStatus} from '../../frontend/src/types.js';

const now=1700000000000;
const observation={faceState:'FACE_PRESENT',faceCount:1,faceTrackingReliable:true,faceQuality:{checks:{singleFace:true,largeEnough:true,wellLit:true,sharpEnough:true,forwardFacing:true},score:1,method:'image-and-geometry-checks',detectorConfidence:null},headOrientation:'roughly_forward',gazeDirection:'roughly_centered',upperBodyVisible:true,upperBodyMovement:null,handCount:0,handPositions:[],handMovement:null} as VisionObservation;
const input={camera:true,consent:true,observation,observedAt:now,readiness:null as FaceReadinessStatus|null,now};
describe('truthful candidate monitoring presentation',()=>{
  it('requires a recent usable backend face result for Active',()=>{
    expect(monitoringPresentation(input).tracking).toBe('Active');
    for(const override of [{observation:null},{observedAt:null},{observedAt:now-6000},{observedAt:now+1},{camera:false},{consent:false}])expect(monitoringPresentation({...input,...override}).tracking).toBe('Unavailable');
  });
  it('never calls presence or readiness identity verification',()=>{
    const ready={state:'FACE_PRESENT',ready:true,identityVerified:false,identityVerification:'not_implemented',checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString(),goodSamples:2,message:'Face readiness confirmed'} as FaceReadinessStatus;
    expect(monitoringPresentation({...input,readiness:ready})).toMatchObject({identity:'Not verified',readiness:'Ready'});
    expect(monitoringPresentation({...input,readiness:{...ready,expiresAt:new Date(now-1).toISOString()}}).readiness).toBe('Retry required');
  });
  it('reports temporary loss only when returned by the backend',()=>{
    expect(monitoringPresentation({...input,observation:{...observation,faceState:'TRACKING_LOST',faceCount:0}}).tracking).toBe('Temporarily lost');
    expect(monitoringPresentation({...input,observation:{...observation,faceState:'FACE_NOT_DETECTED',faceCount:0}}).tracking).toBe('Unavailable');
  });
  it('shows measured lighting and framing guidance without optimistic active state',()=>{
    const poor={...observation,faceState:'QUALITY_LOW' as const,faceQuality:{...observation.faceQuality!,checks:{...observation.faceQuality!.checks,wellLit:false}}};
    expect(monitoringPresentation({...input,observation:poor})).toMatchObject({tracking:'Unavailable',help:expect.stringContaining('even lighting')});
    const multiple={...observation,faceState:'MULTIPLE_FACES' as const,faceCount:2};
    expect(monitoringPresentation({...input,observation:multiple}).help).toContain('only person');
  });
  it('does not equate camera permission or analysis request with backend confirmation',()=>{
    expect(monitoringPresentation({...input,observation:null,readiness:null})).toMatchObject({tracking:'Unavailable',readiness:'Not checked',identity:'Not verified'});
    expect(monitoringPresentation({...input,observation:{...observation,faceTrackingReliable:false}}).tracking).toBe('Unavailable');
  });
});
