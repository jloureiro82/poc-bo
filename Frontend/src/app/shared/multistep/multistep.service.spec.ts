import { TestBed } from '@angular/core/testing';

import { MultistepService } from './multistep.service';

describe('MultistepService', () => {
  let service: MultistepService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MultistepService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
