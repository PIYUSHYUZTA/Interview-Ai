import type { FaceReadinessStatus, VisionObservation } from '../types';

export function monitoringPresentation(input: {
  camera: boolean; consent: boolean; observation: VisionObservation | null;
  observedAt: number | null; readiness: FaceReadinessStatus | null; now: number;
}) {
  const {camera,consent,observation,observedAt,readiness,now}=input;
  const fresh=camera&&consent&&observedAt!==null&&now-observedAt>=0&&now-observedAt<6000;
  let tracking:'Active'|'Temporarily lost'|'Unavailable'='Unavailable';
  let help=!camera?'Turn on your camera to show a local preview.':!consent?'Visual monitoring is off. You can allow sampled analysis before starting.':'Waiting for a recent backend tracking result.';
  if(fresh&&observation){
    const checks=observation.faceQuality?.checks;
    if(observation.faceState==='FACE_PRESENT'&&observation.faceTrackingReliable&&checks&&Object.values(checks).every(Boolean)){
      tracking='Active';help='Face tracking confirmed by the backend. Samples are analyzed about every two seconds.';
    }else if(observation.faceState==='TRACKING_LOST'){
      tracking='Temporarily lost';help='Your face was briefly lost. Face the camera and hold your position while tracking recovers.';
    }else if(observation.faceCount>1){help='More than one face is visible. Please be the only person in the preview.';
    }else if(observation.faceCount===0){help='No face is reliably visible. Check camera position, framing and lighting.';
    }else if(checks&&!checks.wellLit){help='Use even lighting in front of your face; avoid a bright window behind you.';
    }else if(checks&&!checks.largeEnough){help='Move a little closer and keep your face inside the preview.';
    }else if(checks&&!checks.sharpEnough){help='Hold still briefly and check that the camera lens is clear.';
    }else if(checks&&!checks.forwardFacing){help='Face the camera so the model can obtain a useful view.';
    }else{help='Your face is not reliably visible. Check camera position and keep your face in the preview.';}
  }
  let readinessLabel='Not checked';
  if(camera&&consent&&readiness){
    readinessLabel=readiness.ready&&readiness.expiresAt&&Date.parse(readiness.expiresAt)>now?'Ready':
      readiness.state==='FACE_PRESENT'&&readiness.goodSamples===1?'Checking readiness':'Retry required';
  }
  // This backend explicitly implements anonymous presence/readiness, not identity matching.
  return {identity:'Not verified' as const,tracking,help,readiness:readinessLabel,fresh:!!fresh};
}
