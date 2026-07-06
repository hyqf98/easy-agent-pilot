/** useStructuredResultCard — StructuredResultCard 结构化结果卡片组件的 composable，按文件变更分组展示执行结果。 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StructuredExecutionResult } from '@/utils/structuredContent'

export interface StructuredResultCardProps {
  result: StructuredExecutionResult
  title?: string
}

export function useStructuredResultCard(props: StructuredResultCardProps) {
  const { t } = useI18n()

  const fileGroups = computed(() => [
    {
      key: 'generated',
      label: t('message.structured.generatedFiles'),
      files: props.result.generatedFiles
    },
    {
      key: 'modified',
      label: t('message.structured.modifiedFiles'),
      files: props.result.modifiedFiles
    },
    {
      key: 'changed',
      label: t('message.structured.changedFiles'),
      files: props.result.changedFiles
    },
    {
      key: 'deleted',
      label: t('message.structured.deletedFiles'),
      files: props.result.deletedFiles
    }
  ].filter(group => group.files.length > 0))

  return {
    t,
    fileGroups
  }
}
