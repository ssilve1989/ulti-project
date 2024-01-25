const { NODE_ENV } = process.env;

if (NODE_ENV !== 'production') {
  await import('husky').then((dep) => dep.install());
}
