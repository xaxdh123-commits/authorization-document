import type { PuppeteerPdfEngine } from '@auth/template-engine';
export async function probeProductionPdfRuntime(engine:PuppeteerPdfEngine,env:NodeJS.ProcessEnv=process.env){if(env.NODE_ENV==='production'&&env.USE_IN_MEMORY_STORE!=='true')return engine.probeChromeMajor();return undefined;}
