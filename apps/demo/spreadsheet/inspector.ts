import type {SparseCellPatch} from '../../../experiments/sparse-sheet/src/sheet.ts';
/** DOM values captured when the inspector loads a cell, or after a successful apply. */
export interface InspectorDraft {value:string;formula:string;fill:string;bold:boolean}
/** Send only fields changed by the user. A stale form must not rewrite peer fields. */
export function changedInspectorFields(before:InspectorDraft,after:InspectorDraft):SparseCellPatch {
 const patch:SparseCellPatch={};
 if(before.value!==after.value)patch.value=after.value;
 if(before.formula!==after.formula)patch.formula=after.formula||null;
 if(before.fill!==after.fill)patch.fill=after.fill;
 if(before.bold!==after.bold)patch.bold=after.bold;
 return patch;
}

import {parseFieldInput} from './profiles.ts';
import type {SpreadsheetFieldSpec} from '@barocss/doc-sync';
export type FieldDraft=Record<string,string|boolean>;
export function changedProfileFields(fields:Record<string,SpreadsheetFieldSpec>,before:FieldDraft,after:FieldDraft):SparseCellPatch {
 const patch:SparseCellPatch={};
 for(const [name,spec] of Object.entries(fields))if(before[name]!==after[name])patch[name]=parseFieldInput(spec,after[name]!);
 return patch;
}
