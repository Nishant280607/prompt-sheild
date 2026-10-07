import { useEffect, useState } from 'react';
import { dashboardService } from '../services/analysisService';
import type { DeploymentStatus } from '../types/api';

let request: Promise<DeploymentStatus | null> | null = null;

/** Fetch the public deployment status once per page load (shared by all components). */
function loadDeploymentStatus(): Promise<DeploymentStatus | null> {
  request ??= dashboardService
    .systemStatus()
    .then((status) => status.deployment ?? null)
    .catch(() => {
      request = null; // retry next time
      return null;
    });
  return request;
}

/** Whether accounts and sign-ins on this deployment are persistent or reset on restart. */
export function useDeploymentStatus(): DeploymentStatus | null {
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  useEffect(() => {
    let active = true;
    void loadDeploymentStatus().then((value) => {
      if (active) setStatus(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return status;
}
