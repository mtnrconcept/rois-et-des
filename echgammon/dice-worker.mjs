import {simulateDice} from './dice-physics.mjs';
self.onmessage=({data})=>{
  try{self.postMessage({result:simulateDice(data)});}
  catch(error){self.postMessage({error:error.message});}
};
