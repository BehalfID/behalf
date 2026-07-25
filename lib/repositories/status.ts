/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/status";
import { delegate } from "@/lib/repositories/delegate";

export type {
  StatusComponentLean,
  StatusIncidentLean,
  StatusIncidentUpdateInput,
  CreateStatusIncidentInput,
} from "@/lib/repositories/mongo/status";

export {
  statusComponentRepository,
  statusIncidentRepository,
} from "@/lib/repositories/mongo/status";

export const listComponents = delegate("status", "listComponents", mongo.listComponents);
export const createComponent = delegate("status", "createComponent", mongo.createComponent);
export const findComponent = delegate("status", "findComponent", mongo.findComponent);
export const updateComponent = delegate("status", "updateComponent", mongo.updateComponent);
export const deleteComponent = delegate("status", "deleteComponent", mongo.deleteComponent);
export const listIncidents = delegate("status", "listIncidents", mongo.listIncidents);
export const createIncident = delegate("status", "createIncident", mongo.createIncident);
export const findIncident = delegate("status", "findIncident", mongo.findIncident);
export const updateIncident = delegate("status", "updateIncident", mongo.updateIncident);
export const deleteIncident = delegate("status", "deleteIncident", mongo.deleteIncident);
export const findStatusComponents = delegate("status", "findStatusComponents", mongo.findStatusComponents);
export const findOneStatusComponent = delegate("status", "findOneStatusComponent", mongo.findOneStatusComponent);
export const findOneAndDeleteStatusComponent = delegate("status", "findOneAndDeleteStatusComponent", mongo.findOneAndDeleteStatusComponent);
export const findStatusIncidents = delegate("status", "findStatusIncidents", mongo.findStatusIncidents);
export const findOneStatusIncident = delegate("status", "findOneStatusIncident", mongo.findOneStatusIncident);
export const findOneAndDeleteStatusIncident = delegate("status", "findOneAndDeleteStatusIncident", mongo.findOneAndDeleteStatusIncident);
