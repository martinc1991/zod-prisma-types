import { DMMF } from '@prisma/generator-helper';

import { GeneratorConfig } from '.';
import {
  FilterdPrismaAction,
  PRISMA_ACTION_ARG_MAP,
  PRISMA_ACTION_ARRAY,
} from '../constants/objectMaps';
import { ExtendedDMMFDatamodel } from './extendedDMMFDatamodel';
import { ExtendedDMMFModel } from './extendedDMMFModel';
import { ExtendedDMMFSchemaArg } from './extendedDMMFSchemaArg';
import { FormattedNames } from './formattedNames';

/////////////////////////////////////////////////
// CLASS
/////////////////////////////////////////////////

export class ExtendedDMMFSchemaField
  extends FormattedNames
  implements DMMF.SchemaField
{
  readonly name: DMMF.SchemaField['name'];
  readonly isNullable: DMMF.SchemaField['isNullable'];
  readonly outputType: DMMF.SchemaField['outputType'];
  readonly args: ExtendedDMMFSchemaArg[];
  readonly deprecation?: DMMF.SchemaField['deprecation'];
  readonly documentation?: DMMF.SchemaField['documentation'];

  /**
   * Prisma action of the field.
   * @example "findManyUser"
   */
  readonly prismaAction: FilterdPrismaAction;

  /**
   * String that contains the arg name according to prisma types.
   * @example "UserFindManyArgs"
   */
  readonly argName?: string;

  /**
   * Type of the model according to the prisma action.
   * @example "User" for "findManyUser"
   */
  readonly modelType: string | DMMF.OutputType | DMMF.SchemaEnum;

  /**
   * Linked `ExtendedDMMFModel`.
   * Used when generating the `select` and `include` args.
   */
  readonly linkedModel?: ExtendedDMMFModel;

  readonly hasOmitFields: boolean;

  readonly argTypeImports: Set<string>;

  constructor(
    readonly generatorConfig: GeneratorConfig,
    field: DMMF.SchemaField,
    datamodel: ExtendedDMMFDatamodel,
  ) {
    super(field.name);
    this.generatorConfig = generatorConfig;
    this.name = field.name;
    this.isNullable = field.isNullable;
    this.outputType = field.outputType;
    this.deprecation = field.deprecation;
    this.documentation = field.documentation;
    this.prismaAction = this._setMatchedPrismaAction();
    this.modelType = this._setModelType();
    this.argName = this._setArgName();
    this.linkedModel = this._setLinkedModel(datamodel);
    this.args = this._setArgs(field);
    this.hasOmitFields = this._setHasOmitFields();
    this.argTypeImports = this._setArgTypeImports();
  }

  private _setArgs({ args }: DMMF.SchemaField) {
    return args.map((arg) => {
      const linkedField = this.linkedModel?.fields.find(
        (field) => field?.name === arg?.name,
      );

      return new ExtendedDMMFSchemaArg(this.generatorConfig, arg, linkedField);
    });
  }

  /**
   * Matches the prisma action to the specific field.
   * @example "findManyUser" for "findMany"
   * @returns prisma action of the field e.g. "findMany"
   */
  private _setMatchedPrismaAction() {
    return PRISMA_ACTION_ARRAY.find((elem) =>
      this.name.includes(elem),
    ) as FilterdPrismaAction; // can be asserted because all other fields are filterd in ExtendedDMMFOutputType
  }

  /**
   * Extracts the type of the model from the prisma action.
   * @example "findManyUser" -> "User"
   * @returns type of the model extracted from string
   */
  private _setModelType() {
    return this.name
      .replace(this.prismaAction as string, '')
      .replace('OrThrow', '');
  }

  /**
   * Rebuilds the `arg` typename used in prisma types.
   * @example "findManyUser" -> "UserFindManyArgs"
   * @returns name of the argType used in prisma types
   */
  private _setArgName() {
    const argName: FormattedNames | undefined =
      PRISMA_ACTION_ARG_MAP[this.prismaAction];

    if (this.name.includes('OrThrow')) {
      return `${this.modelType}${argName?.formattedNames.pascalCase}OrThrowArgs`;
    }

    if (!argName) return;

    return `${this.modelType}${argName.formattedNames.pascalCase}Args`;
  }

  /**
   * Link dmmf model to schema field to get access to the model properties.
   * Used when generating the `select` and `include` args.
   * @returns datamodel matching the field
   */
  private _setLinkedModel(datamodel: ExtendedDMMFDatamodel) {
    return datamodel.models.find((model) =>
      typeof this.modelType === 'string'
        ? this.modelType.includes(model.name)
        : false,
    );
  }

  /**
   * Checks if the field contains `create`, `upsert`, `update` or `delete` in its name.
   * If so, it checks if the linked model has `omit` fields
   * @returns `true` if the field contains `create`, `upsert`, `update` or `delete` and the linked model has `omit` fields
   */
  private _setHasOmitFields() {
    const writeOmit = /create|upsert|update|delete/.test(this.name);
    if (writeOmit) return Boolean(this.linkedModel?.hasOmitFields);
    return false;
  }

  /**
   * Checkst if the field contains `create`, `upsert`, `update` or `delete` in its name.
   * Used to determine if the type in the created arg should be recreated with updated arg types.
   * @returns `true` if the field contains `create`, `upsert`, `update` or `delete` in its name
   */
  createCustomOmitFieldArgType() {
    return (
      this.hasOmitFields &&
      this.args.some((arg) => /create|update|upsert|delete|data/.test(arg.name))
    );
  }

  private _setArgTypeImports() {
    const imports: string[] = [];

    if (
      this.includeInSelectAndIncludeArgs() &&
      this.linkedModel?.hasRelationFields
    ) {
      imports.push(
        `import { ${this.modelType}IncludeSchema } from '../${this.generatorConfig.inputTypePath}/${this.modelType}IncludeSchema'`,
      );
    }

    this.args.forEach((arg) => {
      if (arg.hasMultipleTypes) {
        return arg.inputTypes.forEach((inputType) => {
          imports.push(
            `import { ${inputType.type}Schema } from '../${this.generatorConfig.inputTypePath}/${inputType.type}Schema'`,
          );
        });
      }

      return imports.push(
        `import { ${arg.inputTypes[0].type}Schema } from '../${this.generatorConfig.inputTypePath}/${arg.inputTypes[0].type}Schema'`,
      );
    });

    // IntSchema and BooleanSchema are not needed since z.boolen() and z.number() are used
    return new Set(
      imports.filter(
        (imp) => !imp.includes('IntSchema') && !imp.includes('BooleanSchema'),
      ),
    );
  }

  /**
   * If the field contains `create`, `upsert`, `update` or `delete` in its name,
   * it returns the string union of the fields that should be omitted.
   * @returns union of fields that should be omitted in custom type
   */
  getOmitUnionForCustomArgType() {
    return this.args
      .filter((arg) => /create|update|upsert|delete|data/.test(arg.name))
      .map((arg) => `"${arg.name}"`)
      .join(' | ');
  }

  getTypeForCustomArgsType() {
    const args: string[] = [];

    this.args.forEach((arg) => {
      if (!arg.rewriteArgWithNewType()) return;

      const argName = `${arg.name}${arg.isRequired ? '' : '?'}: `;

      // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      // NEEDS SOME REFACTORING
      // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      const argType = arg.hasMultipleTypes
        ? arg.inputTypes
            .map((inputType, idx) => {
              const writeSeperator = idx !== arg.inputTypes.length - 1;
              return `z.infer<typeof ${inputType.type}Schema>${
                writeSeperator ? ' | ' : ''
              }`;
            })
            .join('')
        : `z.infer<typeof ${arg.inputTypes[0].type}Schema> ${
            arg.inputTypes[0].isList ? `[]` : ''
          }`;

      args.push(argName + argType);
    });

    return args.join(', ');
  }

  isEnumOutputType() {
    return this.outputType?.location === 'enumTypes';
  }

  isListOutputType() {
    return this.outputType.isList;
  }

  isObjectOutputType() {
    return this.outputType?.location === 'outputObjectTypes';
  }

  isScalarOutputType() {
    return this.outputType?.location === 'scalar';
  }

  isCountField() {
    return this.name.includes('_count');
  }

  /**
   * Used to determine if the field should be included in the `select` and `include` args.
   * @returns `true` if the field does not contian `createMany`, `updateMany` or `deleteMany` in its name
   */
  includeInSelectAndIncludeArgs() {
    return !/createMany|updateMany|deleteMany/.test(this.name);
  }

  writeSelectFindManyImports() {
    return this.isObjectOutputType() && this.isListOutputType();
  }

  writeSelectImports() {
    return this.isObjectOutputType();
  }
}
