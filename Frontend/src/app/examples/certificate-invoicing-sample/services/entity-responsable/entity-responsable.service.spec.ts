import { TestBed } from '@angular/core/testing';

import { EntityResponsableService } from './entity-responsable.service';

describe('EntityResponsableService', () => {
  let service: EntityResponsableService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EntityResponsableService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
