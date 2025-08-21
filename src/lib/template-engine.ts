import { ParamDef, UserError } from '../types.js';

export class TemplateEngine {
  /**
   * Render a template with provided values
   * If {input} is not in the template, it will be appended
   */
  static render(
    template: string,
    values: Record<string, unknown>,
    params?: Record<string, ParamDef>,
  ): string {
    const hasInputPlaceholder = template.includes('{input}');
    let renderedTemplate = template;

    // Replace all placeholders
    renderedTemplate = renderedTemplate.replace(/{([^}]+)}/g, (match, key) => {
      // Check if value was provided
      if (values[key] !== undefined && values[key] !== null) {
        return String(values[key]);
      }

      // Check for default in params definition
      if (params?.[key]?.default !== undefined) {
        return String(params[key].default);
      }

      // Special case for {input}
      if (key === 'input') {
        // If no input provided, that's an error
        if (!values.input) {
          throw new UserError('No input provided');
        }
        return String(values.input);
      }

      // If required param is missing
      if (params?.[key]?.required) {
        throw new UserError(
          `Required parameter missing: ${key}`,
          `Use --${key} to provide a value`,
        );
      }

      // Optional param without value - remove placeholder
      return '';
    });

    // If template doesn't have {input} placeholder and input was provided,
    // append it to the end
    if (!hasInputPlaceholder && values.input) {
      renderedTemplate = renderedTemplate.trim() + '\n\n' + values.input;
    }

    return renderedTemplate.trim();
  }

  /**
   * Extract parameter names from a template
   */
  static extractParams(template: string): string[] {
    const params = new Set<string>();
    const regex = /{([^}]+)}/g;
    let match;

    while ((match = regex.exec(template)) !== null) {
      params.add(match[1]);
    }

    return Array.from(params);
  }

  /**
   * Validate that all required params are present
   */
  static validateParams(
    template: string,
    values: Record<string, unknown>,
    params?: Record<string, ParamDef>,
  ): void {
    const templateParams = this.extractParams(template);

    for (const paramName of templateParams) {
      if (paramName === 'input') {
        continue; // Input is handled separately
      }

      const paramDef = params?.[paramName];
      if (!paramDef) {
        continue; // No definition, so no validation
      }

      const value = values[paramName] ?? paramDef.default;

      // Check required
      if (paramDef.required && value === undefined) {
        throw new UserError(
          `Required parameter missing: ${paramName}`,
          paramDef.description || `Provide --${paramName}`,
        );
      }

      // Check type
      if (value !== undefined) {
        if (paramDef.type === 'number') {
          const num = Number(value);
          if (isNaN(num)) {
            throw new UserError(
              `Parameter '${paramName}' must be a number`,
              `You provided: ${String(value)}`,
            );
          }
          // Convert to number for further use
          values[paramName] = num;
        }

        if (paramDef.type === 'boolean') {
          // Convert string to boolean
          if (typeof value === 'string') {
            values[paramName] = value.toLowerCase() === 'true';
          }
        }

        // Check choices
        if (paramDef.choices && !paramDef.choices.includes(String(value))) {
          throw new UserError(
            `Invalid value for '${paramName}': ${String(value)}`,
            `Available choices: ${paramDef.choices.join(', ')}`,
          );
        }
      }
    }
  }
}
