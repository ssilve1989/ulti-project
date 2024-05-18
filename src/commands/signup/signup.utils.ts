import {
  SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';

export function shouldDeleteReviewMessageForSignup({ status }: SignupDocument) {
  // we don't want to remove approvals that were already handled since they
  // may want to be kept as a reference for why a decision was made earlier
  return (
    status === SignupStatus.PENDING || status === SignupStatus.UPDATE_PENDING
  );
}
