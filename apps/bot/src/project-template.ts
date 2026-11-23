import {buildAuthoringTemplate} from './authoring-template.ts';
import type {AuthoringTemplateResult} from './authoring-template.ts';
export type ProjectTemplateResult = AuthoringTemplateResult;
/** Build a project proposal from supplied facts only; never commits or approves it. */
export function projectProposalTemplate(input:unknown):ProjectTemplateResult {
 return buildAuthoringTemplate(input,['title','problem','objectives','approach','successCriteria'],
  'Preserve the supplied project title, problem, objectives, approach and success criteria in that order. Do not invent facts or commitments.');
}
