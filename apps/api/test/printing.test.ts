import assert from 'node:assert/strict';
import test from 'node:test';
import {AppError} from '../src/lib/errors.js';
import {validatePrintConfig} from '../src/modules/printing/config.js';
import {printConfig} from './printing-fixtures.js';
test('print config preserves field ordering, widths, minimum height and explicit paper size',()=>{
 assert.deepEqual(validatePrintConfig(printConfig),printConfig);
 for(const config of [
  {...printConfig,columns:[{...printConfig.columns[0]!,widthMm:191}]},
  {...printConfig,paper:{...printConfig.paper,marginMm:50},minRowHeightMm:50,columns:[{...printConfig.columns[0]!,widthMm:150}]},
  {...printConfig,paper:{size:'custom',orientation:'portrait',widthMm:50,heightMm:50,marginMm:25}},
  {...printConfig,columns:[printConfig.columns[0],printConfig.columns[0]]},
  {...printConfig,paper:{...printConfig.paper,widthMm:200}},
 ])assert.throws(()=>validatePrintConfig(config),error=>error instanceof AppError&&error.code==='PRINT_LAYOUT_INVALID');
 assert.throws(()=>validatePrintConfig({...printConfig,columns:[{...printConfig.columns[0],field:'costAmount'}]}));
 assert.throws(()=>validatePrintConfig({...printConfig,headerFields:['grossProfit']}));
 assert.throws(()=>validatePrintConfig({...printConfig,paper:{size:'custom',orientation:'portrait',marginMm:0}}));
});
