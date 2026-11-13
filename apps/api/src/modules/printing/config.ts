import {parseSchema,type SchemaValue} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
export function validatePrintConfig(input:unknown):SchemaValue<'PrintConfig'>{
 const config=parseSchema('PrintConfig',input);const paper=config.paper;
 const dimensions=paper.size==='A4'?[210,297]:paper.size==='A5'?[148,210]:[paper.widthMm!,paper.heightMm!];
 const [width,height]=paper.orientation==='landscape'?[Math.max(...dimensions),Math.min(...dimensions)]:[Math.min(...dimensions),Math.max(...dimensions)];
 const fail=(message:string):never=>{throw new AppError('PRINT_LAYOUT_INVALID',422,message);};
 if(paper.size!=='custom'&&(paper.widthMm!==undefined||paper.heightMm!==undefined)){
  if(paper.widthMm!==undefined&&paper.widthMm!==width||paper.heightMm!==undefined&&paper.heightMm!==height)fail('标准纸型不能指定矛盾宽高');
 }
 const printableWidth=width!-2*paper.marginMm,printableHeight=height!-2*paper.marginMm;
 if(printableWidth<=0||printableHeight<config.minRowHeightMm)fail('边距和最小行高超出纸张可打印区域');
 // Compare exact decimal representations, including exponent-form JSON numbers.
 const decimal=(value:number):[bigint,number]=>{const [mantissa,exponent='0']=String(value).split('e');const [whole,fraction='']=mantissa!.split('.');return [BigInt(whole!+fraction),fraction.length-Number(exponent)];};
 const values=[...config.columns.map(column=>column.widthMm),paper.marginMm,paper.marginMm,width!].map(decimal);
 const scale=Math.max(0,...values.map(([,scale])=>scale));const integers=values.map(([value,places])=>value*10n**BigInt(scale-places));
 const available=integers.pop()!;
 if(integers.reduce((sum,value)=>sum+value,0n)>available)fail('列宽总和超出纸张可打印宽度');
 if(new Set(config.columns.map(column=>column.field)).size!==config.columns.length)fail('打印明细字段不能重复');
 return config;
}
