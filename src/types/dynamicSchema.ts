export type ColumnType =
  | 'identifier'
  | 'category'
  | 'numeric'
  | 'percentage'
  | 'status'
  | 'text'
  | 'ignore';

export type BusinessRole =
  | 'attendance'
  | 'assessment'
  | 'assignment'
  | 'certification'
  | 'participation'
  | 'engagement'
  | 'demographic'
  | 'academic'
  | 'program'
  | 'custom'
  | 'none';

export type DisplayGroup =
  | 'profile'
  | 'performance'
  | 'assignments'
  | 'certification'
  | 'engagement'
  | 'academic'
  | 'program'
  | 'custom';

export interface DiscoveredColumn {
  name: string;
  index: number;
  sampleValues: string[];
  inferredType: ColumnType;
  inferredRole: BusinessRole;
  inferredDisplayGroup: DisplayGroup;
  typeConfidence: number;
  roleConfidence: number;
  displayGroupConfidence: number;
  mappedType: ColumnType;
  mappedRole: BusinessRole;
  mappedDisplayGroup: DisplayGroup;
}

export type ColumnMapping = Record<
  string,
  {
    mappedType: ColumnType;
    mappedRole: BusinessRole;
    mappedDisplayGroup: DisplayGroup;
  }
>;

export interface SchemaProfile {
  fileSignature: string;
  headers: string[];
  mapping: ColumnMapping;
  createdAt: string;
  updatedAt: string;
}
