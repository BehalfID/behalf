import StatusComponent, { type StatusComponentDocument } from "@/models/StatusComponent";
import StatusIncident, { type StatusIncidentDocument } from "@/models/StatusIncident";

export type StatusComponentLean = StatusComponentDocument;
export type StatusIncidentLean = StatusIncidentDocument;

export async function listComponents(options?: { enabled?: boolean }): Promise<StatusComponentLean[]> {
  return StatusComponent.find(options?.enabled === undefined ? {} : { enabled: options.enabled })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
}

export async function createComponent(
  input: Omit<StatusComponentDocument, "_id" | "createdAt" | "updatedAt">
) {
  return StatusComponent.create(input);
}

export async function findComponent(componentId: string): Promise<StatusComponentLean | null> {
  return StatusComponent.findOne({ componentId }).lean();
}

export async function updateComponent(
  componentId: string,
  update: Partial<Omit<StatusComponentDocument, "_id" | "componentId" | "createdAt" | "updatedAt">>
) {
  return StatusComponent.findOneAndUpdate({ componentId }, { $set: update }, { new: true }).lean();
}

export async function deleteComponent(componentId: string) {
  return StatusComponent.findOneAndDelete({ componentId }).lean();
}

export async function listIncidents(options?: { includeFixed?: boolean }): Promise<StatusIncidentLean[]> {
  return StatusIncident.find(options?.includeFixed === false ? { status: { $ne: "fixed" } } : {})
    .sort({ createdAt: -1 })
    .lean();
}

export type StatusIncidentUpdateInput = {
  body: string;
  status: "investigating" | "identified" | "watching" | "fixed";
  createdAt: Date;
};

export type CreateStatusIncidentInput = {
  incidentId: string;
  title: string;
  message?: string;
  status: StatusIncidentDocument["status"];
  severity: StatusIncidentDocument["severity"];
  componentIds: string[];
  updates?: StatusIncidentUpdateInput[];
  resolvedAt?: Date;
};

export async function createIncident(input: CreateStatusIncidentInput) {
  return StatusIncident.create(input);
}

export async function findIncident(incidentId: string): Promise<StatusIncidentLean | null> {
  return StatusIncident.findOne({ incidentId }).lean();
}

export async function updateIncident(
  incidentId: string,
  update: Partial<Omit<StatusIncidentDocument, "_id" | "incidentId" | "createdAt" | "updatedAt">>
) {
  return StatusIncident.findOneAndUpdate({ incidentId }, { $set: update }, { new: true }).lean();
}

export async function deleteIncident(incidentId: string) {
  return StatusIncident.findOneAndDelete({ incidentId }).lean();
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findStatusComponents(filter: Record<string, unknown> = {}) {
  return StatusComponent.find(filter);
}

export function findOneStatusComponent(filter: Record<string, unknown>) {
  return StatusComponent.findOne(filter);
}

export function findOneAndDeleteStatusComponent(filter: Record<string, unknown>) {
  return StatusComponent.findOneAndDelete(filter);
}

export function findStatusIncidents(filter: Record<string, unknown> = {}) {
  return StatusIncident.find(filter);
}

export function findOneStatusIncident(filter: Record<string, unknown>) {
  return StatusIncident.findOne(filter);
}

export function findOneAndDeleteStatusIncident(filter: Record<string, unknown>) {
  return StatusIncident.findOneAndDelete(filter);
}

export const statusComponentRepository = { create: createComponent, find: findStatusComponents, findOne: findOneStatusComponent, findOneAndDelete: findOneAndDeleteStatusComponent };
export const statusIncidentRepository = { create: createIncident, find: findStatusIncidents, findOne: findOneStatusIncident, findOneAndDelete: findOneAndDeleteStatusIncident };
