import {buildAuthoringTemplate} from './authoring-template.ts';
import type {AuthoringTemplateResult} from './authoring-template.ts';
export type MeetingTemplateResult = AuthoringTemplateResult;
/** Build an offline draft, never edit a document or invent meeting facts. */
export function meetingNotesTemplate(input:unknown):MeetingTemplateResult {
 return buildAuthoringTemplate(input,['title','summary','decisions','actions'],
  'Preserve the supplied meeting title, summary, decisions and follow-up actions in that order. Do not invent facts.');
}
