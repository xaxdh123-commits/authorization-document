import {describe,expect,it,vi} from 'vitest';
import {ensureSingletonQueue} from './worker.module.js';

describe('pg-boss queue policy reconciliation',()=>{
  it('updates a pre-existing queue whose policy is not singleton',async()=>{const boss:any={getQueue:vi.fn().mockResolvedValueOnce({name:'q',policy:'standard'}).mockResolvedValueOnce({name:'q',policy:'singleton'}),updateQueue:vi.fn(),createQueue:vi.fn()};await ensureSingletonQueue(boss,'q',{retryLimit:3});expect(boss.updateQueue).toHaveBeenCalledWith('q',expect.objectContaining({name:'q',policy:'singleton',retryLimit:3}));expect(boss.createQueue).not.toHaveBeenCalled();});
  it('creates a missing singleton queue',async()=>{const boss:any={getQueue:vi.fn(async()=>null),updateQueue:vi.fn(),createQueue:vi.fn()};await ensureSingletonQueue(boss,'q');expect(boss.createQueue).toHaveBeenCalledWith('q',{name:'q',policy:'singleton'});});
});
