import { CaseCreateSchema, RequirementDefinitionSchema } from '@auth/contracts';
import { CatalogVersionStatus, SignatureMode } from '@prisma/client';
import { RequirementsService } from '../src/requirements/requirements.service';
import { TemplatesService } from '../src/templates/templates.service';
import { CaseService } from '../src/cases/case.service';
import { authorizationRequirementDefinition, optionalRequirementDefinition, workflowCaseInput, workflowTemplateInput } from '../../../tests/e2e/workflow-fixture.js';

describe('workflow E2E fixture production contracts',()=>{
  it('passes requirement, template publish and case service contracts without a 400',async()=>{
    const optional=optionalRequirementDefinition(123);expect(RequirementDefinitionSchema.parse(authorizationRequirementDefinition)).toBeTruthy();expect(RequirementDefinitionSchema.parse(optional)).toBeTruthy();
    const requirementCatalog:any={createRequirement:jest.fn(async(input:any)=>input)};const requirements=new RequirementsService(requirementCatalog);
    await expect(requirements.create(authorizationRequirementDefinition,'admin')).resolves.toBeTruthy();await expect(requirements.create(optional,'admin')).resolves.toBeTruthy();
    const sources=[
      {id:'auth-v1',status:CatalogVersionStatus.PUBLISHED,disabledAt:null,definition:authorizationRequirementDefinition,requirement:{key:'authorization_letter'}},
      {id:'license-v1',status:CatalogVersionStatus.PUBLISHED,disabledAt:null,definition:optional,requirement:{key:optional.key}},
    ];
    const templateInput=workflowTemplateInput('auth-v1','license-v1',123);const templateCatalog:any={getRequirementVersions:jest.fn(async()=>sources),createTemplate:jest.fn(async(input:any)=>({versions:[{id:'template-draft',status:CatalogVersionStatus.DRAFT}],...input})),publishTemplateAtomically:jest.fn(async(_id:string,_actor:string,validate:any)=>{validate({status:CatalogVersionStatus.DRAFT,ast:templateInput.ast,requirements:sources.map(source=>({requirementVersion:source}))});return{id:'template-v1',status:CatalogVersionStatus.PUBLISHED};})};
    const templates=new TemplatesService(templateCatalog);await expect(templates.create(templateInput,'admin')).resolves.toBeTruthy();await expect(templates.publish('template-draft','admin')).resolves.toMatchObject({id:'template-v1'});expect(templateCatalog.createTemplate).toHaveBeenCalledWith(expect.objectContaining({key:templateInput.key,signatureMode:SignatureMode.HANDWRITTEN,requirementVersionIds:['auth-v1','license-v1']}),'admin');
    const caseInput=workflowCaseInput('template-v1',['auth-v1','license-v1']);expect(CaseCreateSchema.parse(caseInput)).toEqual(caseInput);
    const prisma:any={db:{templateVersion:{findFirst:jest.fn(async()=>({id:'template-v1'}))},templateVersionRequirement:{findMany:jest.fn(async()=>sources.map(source=>({requirementVersionId:source.id,requirementVersion:source})))}}};const cases:any={create:jest.fn(async()=>({id:'case-1'}))};
    const caseService=new CaseService(prisma,cases,{} as any,{} as any);jest.spyOn(caseService,'detail').mockResolvedValue({id:'case-1'} as any);
    await expect(caseService.create(caseInput,{userId:'admin',departmentId:'dept'})).resolves.toEqual({id:'case-1'});expect(cases.create).toHaveBeenCalledWith(expect.objectContaining({contactName:'E2E 联系人',requirementVersionIds:['auth-v1','license-v1']}));
  });
});
