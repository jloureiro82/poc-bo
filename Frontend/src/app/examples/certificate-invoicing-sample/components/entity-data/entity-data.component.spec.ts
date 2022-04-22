import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntityDataComponent } from './entity-data.component';

describe('EntityDataComponent', () => {
  let component: EntityDataComponent;
  let fixture: ComponentFixture<EntityDataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EntityDataComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EntityDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
