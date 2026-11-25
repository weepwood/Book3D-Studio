import type {containmentProbe,selfContactProbe} from './solidContacts'
export type ContactMeshData={name:string;active:boolean;positions:Float32Array;indices:Uint32Array;groups:{start:number;count:number;materialIndex?:number}[]}
export type ContactRequest={id:number;opening:number;index:number;meshes:ContactMeshData[]}
export type ContactReport={opening:number;index:number;self:({name:string}&ReturnType<typeof selfContactProbe>)[];containment:({outer:string;inner:string}&ReturnType<typeof containmentProbe>)[];elapsedMs:number}
export type ContactReply={id:number;report:ContactReport}|{id:number;error:string}
