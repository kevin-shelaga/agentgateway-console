import type { ComponentType } from "react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { BackendForm } from "./backend-form";
import { GatewayForm } from "./gateway-form";
import { GatewayClassForm } from "./gatewayclass-form";
import { GrpcRouteForm } from "./grpcroute-form";
import { HttpRouteForm } from "./httproute-form";
import { ParametersForm } from "./parameters-form";
import { PolicyForm } from "./policy-form";

/**
 * Kind-specific guided forms, keyed by registry id. Kinds without an entry
 * fall back to YAML-only editing (still schema-validated and dry-run gated).
 */
export const FORMS: Record<string, ComponentType<ResourceFormProps>> = {
  backends: BackendForm,
  gateways: GatewayForm,
  gatewayclasses: GatewayClassForm,
  grpcroutes: GrpcRouteForm,
  httproutes: HttpRouteForm,
  parameters: ParametersForm,
  policies: PolicyForm,
};
