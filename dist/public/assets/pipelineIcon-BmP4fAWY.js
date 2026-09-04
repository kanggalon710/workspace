import{j as t}from"./react-vendor-RCstk0y8.js";import{c as o,a6 as m,ao as d,a5 as f,ai as h,aF as k,a as g,x as E,ak as I,aj as u,U as y}from"./index-CWd2j6FM.js";import{C}from"./circle-check-big-DeDWYOo-.js";import{Z as P}from"./zap-BTXIG_I9.js";import{C as b}from"./calendar-8OzvIbCZ.js";import{B as x}from"./bell-B05alC0p.js";import{I as L}from"./empty-state-QB7oKiY1.js";import{F}from"./flag-CdeulxHh.js";import{R as N}from"./rocket-J1ZHyqqj.js";import{B as A}from"./briefcase-DmZXKLwD.js";import{M as j}from"./map-pin-CW8Q3_YM.js";import{P as B}from"./phone-vQNr9S_3.js";import{D as T}from"./dollar-sign-LXpbpmIe.js";import{H as _}from"./headphones-63k8qfHP.js";import{T as M}from"./ticket-DWpXwPqT.js";import{T as v}from"./target-DZNvIT8r.js";import{L as p}from"./layers-CuL7OaZ1.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=o("Folder",[["path",{d:"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",key:"1kt360"}]]);/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=o("Handshake",[["path",{d:"m11 17 2 2a1 1 0 1 0 3-3",key:"efffak"}],["path",{d:"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4",key:"9pr0kb"}],["path",{d:"m21 3 1 11h-2",key:"1tisrp"}],["path",{d:"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3",key:"1uvwmv"}],["path",{d:"M3 4h8",key:"1ep09j"}]]);/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=o("ShoppingCart",[["circle",{cx:"8",cy:"21",r:"1",key:"jimo8o"}],["circle",{cx:"19",cy:"21",r:"1",key:"13723u"}],["path",{d:"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12",key:"9zh506"}]]),R="#0EA5E9",ta=["#0EA5E9","#6B7280","#3B82F6","#8B5CF6","#F59E0B","#22C55E","#EF4444"];function oa(a){const e=a??R;return/^#[0-9a-fA-F]{6}$/.test(e)?e+"1A":"transparent"}const s={layers:p,users:y,target:v,megaphone:u,wrench:I,ticket:M,headphones:_,"clipboard-list":E,"trending-up":g,"dollar-sign":T,phone:B,"map-pin":j,briefcase:A,rocket:N,flag:F,inbox:L,package:k,bell:x,calendar:b,star:h,zap:P,"building-2":f,"shopping-cart":S,"file-text":d,"check-circle":C,"alert-circle":m,folder:O,handshake:H},U=Object.keys(s),c=p;function sa(a){return a?s[a]??c:c}function ia({value:a,onChange:e,color:i}){return t.jsx("div",{className:"flex flex-wrap gap-1.5",children:U.map(r=>{const l=s[r],n=a===r;return t.jsx("button",{type:"button","aria-label":`Icon ${r}`,onClick:()=>e(r),className:`flex items-center justify-center size-8 rounded-md border ${n?"ring-2 ring-primary border-primary":"border-border/60 hover:bg-accent"}`,children:t.jsx(l,{className:"size-4",style:n&&i?{color:i}:void 0})},r)})})}export{ia as I,R as P,ta as a,oa as p,sa as r};
