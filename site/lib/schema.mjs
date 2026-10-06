// A tiny request-shape checker (no packages). Each rule is [field, test, message]; the first failing rule's message is returned.
export const isPlainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const oneOf=(...allowed)=>value=>allowed.includes(value);
export const optionalPrice=max=>value=>value==null||(typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=max);
export const boundedText=(min,max)=>value=>typeof value==='string'&&value.length>=min&&value.length<=max;
export const optionalText=max=>value=>value==null||(typeof value==='string'&&value.length<=max);
export function shapeError(body,rules,fallback='The request was invalid.'){
 if(!isPlainObject(body))return fallback;
 for(const [field,test,message] of rules)if(!test(body[field],body))return message;
 return null;
}
