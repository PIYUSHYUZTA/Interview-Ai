import type { FaceReadinessStatus, VisionObservation } from '../types';
import {useEffect,useState} from 'react';
import { monitoringPresentation } from './monitoringPresentation';

export function MonitoringStatus(props:{camera:boolean;cameraPending:boolean;consent:boolean;checking:boolean;
  observation:VisionObservation|null;observedAt:number|null;readiness:FaceReadinessStatus|null;
  warnings:number;maximumWarnings:number;cameraWarnings?:number;cameraNotice?:string;overlays:boolean;onOverlays:(value:boolean)=>void}){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const view=monitoringPresentation({...props,now});
  return <section className="monitoring-status" aria-label="Interview monitoring">
    <header><h2>Interview monitoring</h2><span className={`monitoring-badge ${view.tracking==='Active'?'is-active':'is-neutral'}`} role="status" aria-label={`Tracking: ${view.tracking}`}>{view.tracking}</span></header>
    <dl className="monitoring-summary">
      <div><dt>Camera</dt><dd>{props.cameraPending?'Requesting access':props.camera?'On · permission granted':'Off'}</dd></div>
      <div><dt>Identity</dt><dd>{view.identity}</dd></div>
      <div><dt>Face readiness</dt><dd>{props.checking&&view.readiness==='Not checked'?'Check requested':view.readiness}</dd></div>
      <div><dt>Policy warnings</dt><dd className={props.warnings?'has-warning':''}>{props.warnings} / {props.maximumWarnings}{props.cameraWarnings ? ` · ${props.cameraWarnings} from camera` : ''}</dd></div>
    </dl>
    {props.cameraNotice&&<p className="monitoring-camera-notice" role="status">{props.cameraNotice}</p>}
    <p className="monitoring-help" role="status">{view.help}</p>
    <p className="monitoring-disclosure">Anonymous face tracking only. Identity verification is not available.</p>
    {props.warnings>0&&<p className="monitoring-warning">{props.warnings>=props.maximumWarnings?'Final warning recorded. Another distinct qualifying incident ends this interview.':'A policy warning has been recorded. Review the warning notice before continuing.'}</p>}
    <label className="monitoring-overlay-toggle"><input type="checkbox" checked={props.overlays} onChange={event=>props.onOverlays(event.target.checked)} />Show tracking guides<span>Visual aid only · does not change monitoring</span></label>
  </section>;
}
