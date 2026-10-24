import {SchemaLeafNode,$modelData,$setModelData} from '@barocss/doc-sync/lexical';

/** Application-owned labels; never interpret schema attributes as HTML or URLs. */
export class ProductLeafNode extends SchemaLeafNode {
 static getType(){return 'product-leaf';}
 static clone(node){return new ProductLeafNode(node.__key);}
 static importJSON(value){return new ProductLeafNode().updateFromJSON(value);}
 createDOM(config,editor){
  const element=super.createDOM(config,editor),data=$modelData(this);
  element.textContent=String(data?.attrs?.label||data?.attrs?.alt||data?.type||'Object');
  return element;
 }
}
export const productLeafCodec={nodes:[ProductLeafNode],
 toLexical(model,{schema}){const shape=schema.nodes[model.type]?.shape;if(!['inline','atom'].includes(shape))return null;return $setModelData(new ProductLeafNode(),{type:model.type,shape,...(model.attrs?{attrs:structuredClone(model.attrs)}:{})});},
 fromLexical(node){if(!(node instanceof ProductLeafNode))return null;const data=$modelData(node);return {type:data.type,...(data.attrs?{attrs:structuredClone(data.attrs)}:{})};},
};
