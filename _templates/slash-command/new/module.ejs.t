---
to: src/commands/<%=name%>/<%=name%>.module.ts
---

import { CqrsModule } from '@nestjs/cqrs';
import { <%= Name %>Service } from './<%= name %>.service.js';

@Module({
  imports: [CqrsModule],
  providers: [<%= Name %>Service, <%= Name %>CommandHandler],
})
class <%= Name %>Module {}

export { <%= Name %>Module };
