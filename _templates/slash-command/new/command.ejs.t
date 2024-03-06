---
to: src/commands/<%=name%>/<%= name %>.command.ts
---
import { Injectable } from '@nestjs/common';

@Injectable()
class <%= Name %>Command {}

export { <%= Name %>Command };
