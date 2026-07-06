<script setup lang="ts">
/** PetDetailModal 组件：桌面宠物详情弹窗，展示预览、动画与下载/使用（逻辑见 usePetDetailModal.ts） */
import { useDetailModal, type PetDetailModalEmits, type PetDetailModalProps } from './usePetDetailModal'

const props = withDefaults(defineProps<PetDetailModalProps>(), {
  isActive: false
})
const emit = defineEmits<PetDetailModalEmits>()

const {
  EaButton,
  EaModal,
  PetPreview,
  PetThumb,
  animRows,
  activeAction,
  canUse,
  canDownload,
  close,
  handleDownload,
  handleUse,
  playAnim,
  t
} = useDetailModal(props, emit as never)
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="pet-detail-modal"
    @update:visible="emit('update:visible', $event)"
  >
    <div
      v-if="pet"
      class="pet-detail"
    >
      <!-- 左侧：大图实时预览 -->
      <div class="pet-detail__stage">
        <PetPreview
          :pet-id="pet.id"
          :spritesheet-src="pet.spritesheetSrc"
          :scale="1.1"
          :active-action="activeAction"
        />
      </div>

      <!-- 右侧：信息 + 动画状态 -->
      <div class="pet-detail__side">
        <div class="pet-detail__head">
          <h3 class="pet-detail__name">
            {{ pet.displayName }}
          </h3>
          <div class="pet-detail__meta">
            <span
              v-if="pet.kind"
              class="pet-detail__kind"
            >{{ pet.kind }}</span>
            <span
              v-if="pet.source === 'builtin'"
              class="pet-detail__badge"
            >{{ t('settings.desktopPet.builtinBadge') }}</span>
            <span
              v-else-if="pet.source === 'downloaded'"
              class="pet-detail__badge pet-detail__badge--muted"
            >{{ t('settings.desktopPet.installed') }}</span>
          </div>
        </div>

        <p
          v-if="pet.description"
          class="pet-detail__desc"
        >
          {{ pet.description }}
        </p>

        <div
          v-if="pet.tags && pet.tags.length"
          class="pet-detail__tags"
        >
          <span
            v-for="tag in pet.tags"
            :key="tag"
            class="pet-detail__tag"
          >{{ tag }}</span>
        </div>

        <!-- 动画状态：9 行，每行显示首帧缩略图 + 名称，点击播放 -->
        <div class="pet-detail__anims">
          <p class="pet-detail__anims-title">
            {{ t('settings.desktopPet.animStates') }}
          </p>
          <div class="pet-detail__anims-grid">
            <button
              v-for="row in animRows"
              :key="row.id"
              type="button"
              class="anim-cell"
              :class="{ 'anim-cell--active': activeAction === row.id }"
              @click="playAnim(row.id)"
            >
              <PetThumb
                :src="pet.spritesheetSrc"
                :row="row.index"
                :col="0"
                :lazy="false"
              />
              <span class="anim-cell__label">{{ row.id }}</span>
            </button>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="pet-detail__actions">
          <EaButton
            v-if="canDownload"
            type="primary"
            icon="download"
            @click="handleDownload"
          >
            {{ t('settings.desktopPet.downloadAndUse') }}
          </EaButton>
          <EaButton
            v-else-if="canUse"
            type="primary"
            icon="check"
            @click="handleUse"
          >
            {{ t('settings.desktopPet.setAsActive') }}
          </EaButton>
          <span
            v-else
            class="pet-detail__current"
          >{{ t('settings.desktopPet.currentlyActive') }}</span>
          <EaButton
            type="ghost"
            @click="close"
          >
            {{ t('settings.desktopPet.close') }}
          </EaButton>
        </div>
      </div>
    </div>
  </EaModal>
</template>
<style scoped src="./styles.css"></style>
