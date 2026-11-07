/** Rebuild the shipped character adaptations from documented private sources. */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!existsSync(root+'work/model-research/blue-eyes-duel-links/Blue-Eyes White Dragon/MMD_004007.dae'))throw new Error('Download the documented source archives first: python scripts/fetch-model-sources.py');
for(const [program,args] of [
 [process.execPath,['scripts/import-duel-links.mjs']],
 ['blender',['-b','-t','4','--python-exit-code','1','--python','scripts/convert-duel-links.py']],
 ['blender',['-b','-t','4','--python-exit-code','1','--python','scripts/convert-celtic.py']],
 [process.execPath,['scripts/compact-glb.mjs']],
]){const result=spawnSync(program,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
