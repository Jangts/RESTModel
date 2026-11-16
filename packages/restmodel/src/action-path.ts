/** 动作路径参数只从自有数据字段提取，其余输入交给原有 query/body 管线。 */
import { configurationFields, ResourceConfigurationError } from './configuration.js';
import { identitySegments, pathSegments } from './request.js';

export type ActionPathSegment = { readonly parameter: string } | { readonly literal: string };

/** 在声明阶段检查路径并编译具名完整片段，不接受任意字符串插值。 */
export function compileActionPath(path: string): readonly ActionPathSegment[] {
  pathSegments(path);
  return Object.freeze(
    path
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        if (segment.startsWith(':')) {
          const parameter = segment.slice(1);
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(parameter))
            throw new ResourceConfigurationError('action.path: invalid parameter name');
          return Object.freeze({ parameter });
        }
        if (segment.includes(':'))
          throw new ResourceConfigurationError(
            'action.path: parameters must occupy a complete segment',
          );
        return Object.freeze({ literal: pathSegments(segment)[0]! });
      }),
  );
}

/** 填入单值路径参数并从剩余输入中移除；不修改调用方对象或读取 getter。 */
export function bindActionPath(
  template: readonly ActionPathSegment[],
  input: unknown,
): { segments: string[]; input: unknown } {
  const parameters = template.flatMap((segment) =>
    'parameter' in segment ? [segment.parameter] : [],
  );
  if (!parameters.length)
    return { segments: template.map((segment) => (segment as { literal: string }).literal), input };
  const fields = configurationFields(input, 'action.input');
  const values = new Map<string, string>();
  for (const name of new Set(parameters)) {
    const value = fields.get(name);
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new ResourceConfigurationError(
        `action.input.${name}: path parameter requires a string or finite number`,
      );
    values.set(name, identitySegments(value)[0]!);
    fields.delete(name);
  }
  return {
    segments: template.map((segment) =>
      'parameter' in segment ? values.get(segment.parameter)! : segment.literal,
    ),
    input: fields.size ? Object.fromEntries(fields) : undefined,
  };
}
