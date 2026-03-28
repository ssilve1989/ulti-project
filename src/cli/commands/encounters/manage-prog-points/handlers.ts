import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { ProgPointDocument } from '../../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import {
  addProgPoint,
  deleteProgPoint,
  getAllProgPoints,
  getEncounter,
  getNextProgPointOrder,
  reorderProgPoints,
  updateProgPoint,
} from '../../../utils/firestore.js';

export async function promptSelectProgPoint(
  db: Firestore,
  encounterId: string,
  message: string,
): Promise<ProgPointDocument> {
  const progPoints = await getAllProgPoints(db, encounterId);
  if (progPoints.length === 0) {
    throw new Error('No prog points found for this encounter.');
  }
  return cancelIfCancel(
    await clack.select({
      message,
      options: progPoints.map((p) => ({
        value: p,
        label: `${p.id} — ${p.label} (${p.partyStatus})${p.active ? '' : ' [inactive]'}`,
      })),
    }),
  );
}

export async function handleAdd(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const id = cancelIfCancel(
    await clack.text({
      message: 'Prog point ID (used in Sheets, e.g. Giga Flare #1):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );
  const label = cancelIfCancel(
    await clack.text({
      message: 'Label (displayed in Discord):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );
  const partyStatus = cancelIfCancel(
    await clack.select({
      message: 'Party status:',
      options: Object.values(PartyStatus).map((v) => ({ value: v, label: v })),
    }),
  );

  const order = await getNextProgPointOrder(db, encounterId);
  const progPoint: ProgPointDocument = {
    id: id.trim(),
    label: label.trim(),
    partyStatus,
    order,
    active: true,
  };

  const spinner = clack.spinner();
  spinner.start('Adding prog point...');
  await addProgPoint(db, encounterId, progPoint);
  spinner.stop(`Added: ${progPoint.id} — ${progPoint.label}`);
}

export async function handleEdit(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const progPoint = await promptSelectProgPoint(
    db,
    encounterId,
    'Select prog point to edit:',
  );

  const field = cancelIfCancel(
    await clack.select({
      message: 'What would you like to edit?',
      options: [
        { value: 'label', label: 'Label' },
        { value: 'partyStatus', label: 'Party status' },
      ],
    }),
  );

  let updates: Partial<ProgPointDocument> = {};

  if (field === 'label') {
    const label = cancelIfCancel(
      await clack.text({
        message: 'New label:',
        initialValue: progPoint.label,
        validate: (v) => (v?.trim() ? undefined : 'Required'),
      }),
    );
    updates = { label: label.trim() };
  } else {
    const partyStatus = cancelIfCancel(
      await clack.select({
        message: 'New party status:',
        options: Object.values(PartyStatus).map((v) => ({
          value: v,
          label: v,
        })),
      }),
    );
    updates = { partyStatus };
  }

  const spinner = clack.spinner();
  spinner.start('Updating...');
  await updateProgPoint(db, encounterId, progPoint.id, updates);
  spinner.stop(`Updated ${progPoint.id}`);
}

export async function handleToggle(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const progPoints = await getAllProgPoints(db, encounterId);
  const encounter = await getEncounter(db, encounterId);

  const selected = cancelIfCancel(
    await clack.select({
      message: 'Select prog point to toggle:',
      options: progPoints.map((p) => ({
        value: p,
        label: `${p.active ? '✅' : '❌'} ${p.id} — ${p.label}`,
      })),
    }),
  );

  if (selected.active && encounter) {
    if (
      encounter.progPartyThreshold === selected.id ||
      encounter.clearPartyThreshold === selected.id
    ) {
      clack.log.error(
        `Cannot deactivate '${selected.id}' — it is currently set as a threshold. Update the threshold first.`,
      );
      return;
    }
  }

  const newActive = !selected.active;
  const spinner = clack.spinner();
  spinner.start(
    `${newActive ? 'Activating' : 'Deactivating'} ${selected.id}...`,
  );
  await updateProgPoint(db, encounterId, selected.id, { active: newActive });
  spinner.stop(`${selected.id} is now ${newActive ? 'active' : 'inactive'}`);
}

export async function handleDelete(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const encounter = await getEncounter(db, encounterId);
  const progPoint = await promptSelectProgPoint(
    db,
    encounterId,
    'Select prog point to delete:',
  );

  if (encounter) {
    if (
      encounter.progPartyThreshold === progPoint.id ||
      encounter.clearPartyThreshold === progPoint.id
    ) {
      clack.log.error(
        `Cannot delete '${progPoint.id}' — it is currently set as a threshold. Update the threshold first.`,
      );
      return;
    }
  }

  const confirmed = cancelIfCancel(
    await clack.confirm({
      message: `Delete '${progPoint.id} — ${progPoint.label}'? This cannot be undone.`,
    }),
  );
  if (!confirmed) {
    clack.log.info('Deletion cancelled.');
    return;
  }

  const spinner = clack.spinner();
  spinner.start('Deleting...');
  await deleteProgPoint(db, encounterId, progPoint.id);
  spinner.stop(`Deleted ${progPoint.id}`);
}

export async function handleReorder(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const progPoints = await getAllProgPoints(db, encounterId);
  if (progPoints.length < 2) {
    clack.log.warn('Need at least 2 prog points to reorder.');
    return;
  }

  clack.log.info('Current order:');
  for (const p of progPoints) {
    clack.log.message(`  ${p.order}. ${p.id} — ${p.label}`);
  }

  const newOrderInput = cancelIfCancel(
    await clack.text({
      message: 'Enter prog point IDs in new order (comma-separated):',
      placeholder: progPoints.map((p) => p.id).join(', '),
      validate: (v) => {
        const ids = (v ?? '').split(',').map((s) => s.trim());
        const existing = progPoints.map((p) => p.id);
        const missing = existing.filter((id) => !ids.includes(id));
        const unknown = ids.filter((id) => !existing.includes(id));
        if (missing.length > 0)
          return `Missing prog points: ${missing.join(', ')}`;
        if (unknown.length > 0)
          return `Unknown prog points: ${unknown.join(', ')}`;
        return undefined;
      },
    }),
  );

  const orderedIds = newOrderInput.split(',').map((s) => s.trim());
  const ordered = orderedIds.map((id, index) => ({ id, order: index }));

  const spinner = clack.spinner();
  spinner.start('Reordering...');
  await reorderProgPoints(db, encounterId, ordered);
  spinner.stop('Reordered successfully');
}

export async function dispatchAction(
  db: Firestore,
  encounterId: string,
  action: string,
): Promise<void> {
  if (action === 'add') await handleAdd(db, encounterId);
  else if (action === 'edit') await handleEdit(db, encounterId);
  else if (action === 'toggle') await handleToggle(db, encounterId);
  else if (action === 'delete') await handleDelete(db, encounterId);
  else if (action === 'reorder') await handleReorder(db, encounterId);
}
