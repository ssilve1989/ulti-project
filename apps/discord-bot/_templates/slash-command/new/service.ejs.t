---
to: src/<%=name%>/<%=name%>.service.ts
---
import { Injectable } from '@nestjs/common';

@Injectable()
class <%= h.changeCase.pascal(name) %>Service {}

export { <%= h.changeCase.pascal(name) %>Service };
