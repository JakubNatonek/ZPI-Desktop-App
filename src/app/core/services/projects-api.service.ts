import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ProjectDto {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectsApiService {
  private readonly projectsUrl = `${environment.apiBaseUrl}/api/projects`;

  constructor(private readonly http: HttpClient) {}

  getProjects(): Observable<ProjectDto[]> {
    return this.http.get<ProjectDto[]>(this.projectsUrl);
  }
}
