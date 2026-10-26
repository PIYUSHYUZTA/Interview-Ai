import type { FaceReadinessStatus, VisionObservation } from '../types';

export function monitoringPresentation(input: {
  camera: boolean; consent: boolean; observation: VisionObservation | null;
  observedAt: number | null; readiness: FaceReadinessStatus | null; now: number;
}) {
  const {camera,consent,observation,observedAt,readiness,now}=input;
  // `now` ticks once a second while samples arrive a few times a second, so the latest result is often
  // slightly newer than `now`; allow that (and small clock skew) instead of treating it as stale.
  const fresh=camera&&consent&&observedAt!==null&&now-observedAt>=-2000&&now-observedAt<6000;
  let tracking:'Active'|'Temporarily lost'|'Unavailable'='Unavailable';
  let help=!camera?'Turn on your camera to show a local preview.':!consent?'Face, eye and hand tracking are off. Visual monitoring has to be enabled before the interview starts.':'Waiting for a recent backend tracking result.';
  if(fresh&&observation){
    const checks=observation.faceQuality?.checks;
    if(observation.faceState==='FACE_PRESENT'&&observation.faceTrackingReliable&&checks&&Object.values(checks).every(Boolean)){
      tracking='Active';help='Face tracking confirmed by the backend. Camera samples are analysed a few times per second.';
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

/** One short, truthful line for the camera preview, from the latest backend observation.
 * Directions stay generic ("turned") because the worker reports unmirrored camera coordinates. */
export function faceStatus(observation: VisionObservation | null): { label: string; tone: 'ok' | 'notice' | 'warn' | 'waiting' } {
  if (!observation) return { label: 'Looking for your face…', tone: 'waiting' };
  // Phones come only from the object detector, confirmed over several scans; worded as a possibility,
  // and shown whatever the face state is.
  const phone = observation.phoneObservation?.status === 'seen' ? ' · possible phone in view' : '';
  if (observation.faceState === 'MULTIPLE_FACES') return { label: `${observation.faceCount} faces in view${phone}`, tone: 'warn' };
  if (observation.faceState === 'FACE_NOT_DETECTED') return { label: `No face in view${phone}`, tone: 'warn' };
  if (observation.faceState === 'TRACKING_LOST') return { label: `Face lost · tracking resumes when you return${phone}`, tone: 'warn' };
  const checks = observation.faceQuality?.checks;
  const lowLight = observation.faceQuality?.lowLight ? ' · low light' : '';
  if (observation.faceState === 'QUALITY_LOW' && checks) {
    const advice = !checks.largeEnough ? 'move closer' : !checks.wellLit ? 'add more light' : !checks.sharpEnough ? 'hold still' : !checks.forwardFacing ? 'face the camera' : 'adjust your position';
    return { label: `Face detected · ${advice}${phone}`, tone: 'notice' };
  }
  const head = observation.directionEstimate?.headReliable ? observation.directionEstimate.headDirections : [];
  const pose = head.includes('up') ? 'head tilted up' : head.includes('down') ? 'head tilted down' : head.some((d) => d === 'left' || d === 'right') ? 'head turned' : 'facing forward';
  // Eye direction is an uncalibrated estimate: say only that the eyes look off-centre, never where.
  const direction = observation.directionEstimate;
  const eyes = !head.length && direction?.gazeReliable && direction.gazeDirections.some((d) => d !== 'unavailable') ? ' · eyes off-centre' : '';
  const turns = direction?.repeatedHeadTurns ? ' · frequent head turns' : '';
  // Hands are described by position only; no gesture or object is inferred from hand landmarks.
  const hand = observation.movementObservation?.handNearFace ? ' · hand near face' : '';
  return { label: `Face detected · ${pose}${eyes}${turns}${hand}${phone}${lowLight}`, tone: head.length || eyes || turns || hand || phone ? 'notice' : 'ok' };
}
