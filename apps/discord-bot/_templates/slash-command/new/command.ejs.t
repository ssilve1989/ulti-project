---
to: src/<%=name%>/<%= name %>.command.ts
---
import { Injectable } from '@nestjs/common';

@Injectable()
class <%= h.changeCase.pascal(name) %>Command {}

export { <%= h.changeCase.pascal(name) %>Command };
