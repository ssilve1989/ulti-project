import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_COMMENT_INPUT_ID,
  APPROVAL_COMMENT_MODAL_ID,
  APPROVE_BUTTON_ID,
  APPROVE_WITH_COMMENT_BUTTON_ID,
  createApprovalButtonsRow,
  createApprovalCommentModal,
} from './approval-decision.components.js';

describe('approval-decision.components', () => {
  describe('createApprovalButtonsRow', () => {
    it('creates both buttons disabled when disabled is true', () => {
      const row = createApprovalButtonsRow(true);
      const [approve, approveWithComment] = row.components.map((c) =>
        c.toJSON(),
      );

      expect(approve).toMatchObject({
        custom_id: APPROVE_BUTTON_ID,
        style: ButtonStyle.Success,
        disabled: true,
      });
      expect(approveWithComment).toMatchObject({
        custom_id: APPROVE_WITH_COMMENT_BUTTON_ID,
        style: ButtonStyle.Primary,
        disabled: true,
      });
    });

    it('creates both buttons enabled when disabled is false', () => {
      const row = createApprovalButtonsRow(false);
      const [approve, approveWithComment] = row.components.map((c) =>
        c.toJSON(),
      );

      expect(approve.disabled).toBe(false);
      expect(approveWithComment.disabled).toBe(false);
    });
  });

  describe('createApprovalCommentModal', () => {
    it('creates a modal with an optional comment input', () => {
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: narrowing a builder-output modal to access its components structure in a builder-output test, matches project convention
      const modal = createApprovalCommentModal().toJSON() as {
        custom_id: string;
        components: Array<{
          components: Array<{ custom_id?: string; required?: boolean }>;
        }>;
      };
      const [row] = modal.components;
      const [input] = row.components;

      expect(modal.custom_id).toBe(APPROVAL_COMMENT_MODAL_ID);
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: narrowing a builder-output component union in a builder-output test, matches project convention (see mock-factory.ts notes)
      expect((input as { custom_id: string }).custom_id).toBe(
        APPROVAL_COMMENT_INPUT_ID,
      );
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: narrowing a builder-output component union in a builder-output test
      expect((input as { required: boolean }).required).toBe(false);
    });
  });
});
