import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

/**
 * Custom decorator to validate if two password fields either match or do not match.
 *
 * @param {string} property - The property of the class to compare with.
 * @param {('match' | 'notMatch')} condition - Specifies whether the fields should match or not match.
 * @param {ValidationOptions} [validationOptions] - Optional class-validator options to configure the validation.
 *
 * @returns {Function} - A function to register the custom validation decorator.
 */

export function PasswordMatch(
  property: string,
  condition: 'match' | 'notMatch' = 'match',
  validationOptions?: ValidationOptions,
) {
  return function (object: Record<string, any>, propertyName: string) {
    registerDecorator({
      name: 'PasswordMatch',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property, condition],
      options: validationOptions,
      validator: {
        validate(
          value: any,
          args: ValidationArguments,
        ): boolean | Promise<boolean> {
          const [relatedPropertyName, condition] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];

          if (condition === 'match') {
            return relatedValue === value;
          } else if (condition === 'notMatch') {
            return relatedValue !== value;
          }
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName, condition] = args.constraints;

          if (condition === 'match') {
            return `The ${relatedPropertyName} and ${args.property} fields must match.`;
          } else if (condition === 'notMatch') {
            return `The ${relatedPropertyName} and ${args.property} fields should not be the same.`;
          }

          return `Validation failed for ${args.property}.`;
        },
      },
    });
  };
}
