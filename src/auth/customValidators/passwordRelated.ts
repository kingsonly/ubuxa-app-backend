import {  startCase } from 'lodash';
import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { compareTwoStrings } from '../../utils/string-similarity';

/**
 * The PasswordRelated decorator ensures that a
 * user's password is not too similar to other
 * properties, such as their email, first name,
 * last name, etc.:
 * @param properties  An array of property names that will be compared against the password.
 * @param validationOptions  Optional validation options provided by class-validator to customize validation behavior (e.g., custom error messages).
 * @returns
 */

export function PasswordRelated(
  properties: string[],
  validationOptions?: ValidationOptions,
) {
  return function (object: Record<string, any>, propertyName: string) {
    registerDecorator({
      name: 'PasswordRelated',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(
          value: any,
          _args: ValidationArguments,
        ): boolean | Promise<boolean> {
          const targetObj = _args.object as Record<string, any>;

          if (!value) {
            return true; // Skip validation if the value is empty (no password to check)
          }

          return properties.every((prop) => {
            const propValue = targetObj[prop];

            if (!propValue || typeof propValue !== 'string') {
              return true; // Skip comparison if the property is not a string or is undefined/null
            }

            const similarity = compareTwoStrings(propValue, value);

            return similarity < 0.35;
          });
        },
        defaultMessage(_args: ValidationArguments) {
          const targetObj = _args.object as Record<string, any>;
          const failedFields = properties
            .filter((prop) => {
              const propValue = targetObj[prop];
              return (
                propValue &&
                typeof propValue === 'string' &&
                compareTwoStrings(propValue, _args.value) >= 0.35
              );
            })
            .map((prop) => startCase(prop));

          return `{type: ['password', '${failedFields.join(', ')}'], error: 'Password must not be similar to your ${failedFields.join(', ')}'}`;
        },
      },
    });
  };
}
