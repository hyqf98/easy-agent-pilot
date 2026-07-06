/** 计划服务（表单引擎、拆分编排、提示词）的统一再导出。 */
export { FormEngine, formEngine, FORM_TEMPLATES } from './FormEngine'
export { TaskSplitOrchestrator, taskSplitOrchestrator } from './TaskSplitOrchestrator'
export type { SplitChatMessage } from './TaskSplitOrchestrator'
export {
  appendPlanSplitInstructionGuard,
  buildPlanSplitSystemPrompt,
  buildPlanSplitKickoffPrompt,
  buildFormResponsePrompt,
  buildOutputCorrectionPrompt,
  buildPlanSplitJsonSchema,
  buildTaskResplitKickoffPrompt,
  buildTaskListOptimizeKickoffPrompt
} from './prompts'
