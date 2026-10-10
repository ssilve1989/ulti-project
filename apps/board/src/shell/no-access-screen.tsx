import { SignOutButton } from './sign-out-button';

const WHY = Object.freeze({
  'not-in-guild': "Your Discord account isn't in the Ulti Project server.",
  'no-role':
    "Your Discord account doesn't have a board role. Ask an admin for one.",
});

export function NoAccessScreen(props: {
  readonly reason: keyof typeof WHY;
  readonly refetchMe: () => void;
}) {
  return (
    <main class="screen">
      <h1>You don't have access</h1>
      <p>{WHY[props.reason]}</p>
      <SignOutButton refetchMe={props.refetchMe} />
    </main>
  );
}
