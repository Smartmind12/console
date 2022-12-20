import {
  useCallback,
  useMemo,
  useState,
  ChangeEvent,
  ReactElement,
} from "react";
import {
  BasicProgressMessageBox,
  BasicSingleSelect,
  BasicTextArea,
  BasicTextField,
  ProgressMessageBoxState,
  SingleSelectOption,
  SolidButton,
} from "@instill-ai/design-system";
import * as yup from "yup";
import Image from "next/image";
import { AxiosError } from "axios";

import {
  ConnectorDefinition,
  CreateDestinationPayload,
  PipelineMode,
  validateResourceId,
} from "@/lib/instill";
import { Nullable } from "@/types/general";
import {
  useCreateDestination,
  useDestinationDefinitions,
} from "@/services/connector";
import { useAmplitudeCtx } from "@/contexts/AmplitudeContext";
import { FormBase } from "@/components/ui";
import {
  AirbyteFieldValues,
  AirbyteFieldErrors,
  SelectedItemMap,
  useBuildAirbyteYup,
  useAirbyteFormTree,
  useAirbyteFieldValues,
} from "@/lib/airbytes";
import { AirbyteDestinationFields } from "@/lib/airbytes/components";
import { sendAmplitudeData } from "@/lib/amplitude";

export type CreateDestinationFormProps = {
  setResult: Nullable<(destinationId: string) => void>;
  flex1: boolean;
  title: Nullable<ReactElement>;
  padding: Nullable<string>;
  marginBottom: Nullable<string>;
  onSuccessCb: Nullable<() => void>;

  // Pipeline mode will only work when setup the pipeline.
  // Please pass null if this is not under create pipeline flow.
  pipelineMode: Nullable<PipelineMode>;
};

const CreateDestinationForm = ({
  setResult,
  flex1,
  title,
  padding,
  marginBottom,
  onSuccessCb,
  pipelineMode,
}: CreateDestinationFormProps) => {
  const { amplitudeIsInit } = useAmplitudeCtx();

  // ##########################################################################
  // # 1 - Get the destination definition and static state for fields         #
  // ##########################################################################

  const destinationDefinitions = useDestinationDefinitions();

  const destinationOptions = useMemo(() => {
    if (!destinationDefinitions.isSuccess) return [];

    if (pipelineMode === "MODE_ASYNC") {
      return destinationDefinitions.data
        .filter(
          (e) =>
            e.name !== "destination-connector-definitions/destination-http" &&
            e.name !== "destination-connector-definitions/destination-grpc"
        )
        .map((e) => ({
          label: e.connector_definition.title,
          value: e.name,
          startIcon: (
            <Image
              className="my-auto"
              src={
                e.connector_definition.docker_repository.split("/")[0] ===
                "airbyte"
                  ? `/icons/airbyte/${e.connector_definition.icon}`
                  : `/icons/instill/${e.connector_definition.icon}`
              }
              width={24}
              height={24}
              layout="fixed"
            />
          ),
        }));
    }

    return destinationDefinitions.data.map((e) => ({
      label: e.connector_definition.title,
      value: e.name,
      startIcon: (
        <Image
          className="my-auto"
          src={
            e.connector_definition.docker_repository.split("/")[0] === "airbyte"
              ? `/icons/airbyte/${e.connector_definition.icon}`
              : `/icons/instill/${e.connector_definition.icon}`
          }
          width={24}
          height={24}
          layout="fixed"
        />
      ),
    }));
  }, [
    destinationDefinitions.isSuccess,
    destinationDefinitions.data,
    pipelineMode,
  ]);

  const [selectedDestinationDefinition, setSelectedDestinationDefinition] =
    useState<Nullable<ConnectorDefinition>>(null);

  const [selectedDestinationOption, setSelectedDestinationOption] =
    useState<Nullable<SingleSelectOption>>(null);

  // Instill Ai provided connector HTTP and gRPC can only have default id
  // destination-http and destination-grpc. We need to make sure user have
  // proper instruction on this issue.

  const canSetIdField = useMemo(() => {
    if (!selectedDestinationDefinition) return true;

    if (
      selectedDestinationDefinition.connector_definition.docker_repository ===
        "instill-ai/destination-grpc" ||
      selectedDestinationDefinition.connector_definition.docker_repository ===
        "instill-ai/destination-http"
    ) {
      return false;
    } else {
      return true;
    }
  }, [selectedDestinationDefinition]);

  const defaultId = useMemo(() => {
    if (!selectedDestinationDefinition) return null;

    if (
      selectedDestinationDefinition.connector_definition.docker_repository ===
      "instill-ai/destination-grpc"
    ) {
      return "destination-grpc";
    }

    if (
      selectedDestinationDefinition.connector_definition.docker_repository ===
      "instill-ai/destination-http"
    ) {
      return "destination-http";
    }

    return null;
  }, [selectedDestinationDefinition]);

  const getSetupGuide = useCallback(() => {
    if (selectedDestinationDefinition) {
      if (selectedDestinationDefinition.id === "destination-http") {
        return "https://www.instill.tech/docs/destination-connectors/http";
      } else if (selectedDestinationDefinition.id === "destination-grpc") {
        return "https://www.instill.tech/docs/destination-connectors/grpc";
      }
    }

    return selectedDestinationDefinition
      ? selectedDestinationDefinition.connector_definition.documentation_url
      : "https://www.instill.tech/docs/destination-connectors/overview";
  }, [selectedDestinationDefinition]);

  // ##########################################################################
  // # 2 - Create interior state for managing the form                        #
  // ##########################################################################

  const destinationFormTree = useAirbyteFormTree(selectedDestinationDefinition);

  const { fieldValues, setFieldValues } = useAirbyteFieldValues(
    destinationFormTree,
    null
  );

  const [fieldErrors, setFieldErrors] =
    useState<Nullable<AirbyteFieldErrors>>(null);

  const [selectedConditionMap, setSelectedConditionMap] =
    useState<Nullable<SelectedItemMap>>(null);

  const [formIsDirty, setFormIsDirty] = useState(false);

  const [messageBoxState, setMessageBoxState] =
    useState<ProgressMessageBoxState>({
      activate: false,
      message: null,
      description: null,
      status: null,
    });

  const createDestination = useCreateDestination();

  const airbyteYup = useBuildAirbyteYup(
    selectedDestinationDefinition?.connector_definition.spec
      .connection_specification ?? null,
    selectedConditionMap,
    null
  );

  /**
   *  We store our data in two form, one is in dot.notation and the other
   *  is in object and the airbyteYup is planned to verify object part of
   *  the data
   *
   * {
   *    tunnel_method: "SSH",
   *    tunnel_method.tunnel_key: "hi", <--- yup won't verify this
   *    configuration: { <--- yup will verify this object
   *      tunnel_method: {
   *        tunnel_method: "SSH",
   *        tunnel_key: "hi"
   *      }
   *    }
   * }
   *
   */

  const formYup = useMemo(() => {
    if (!airbyteYup) return null;

    return yup.object({
      id: canSetIdField
        ? yup.string().required()
        : yup.string().nullable().notRequired(),
      configuration: airbyteYup,
    });
  }, [airbyteYup, canSetIdField]);

  // ##########################################################################
  // # 3 - Create the destination                                             #
  // ##########################################################################

  const submitHandler = useCallback(async () => {
    if (!fieldValues || !formYup) {
      return;
    }

    let stripValues = {} as { configuration: AirbyteFieldValues };

    // We don't validate the rest of the field if the ID is incorrect
    if (!validateResourceId(fieldValues.id as string)) {
      setFieldErrors((prev) => ({
        ...prev,
        id: "Resource ID restricts to lowercase letters, numbers, and hyphen, with the first character a letter, the last a letter or a number, and a 63 character maximum.",
      }));
      return;
    }

    try {
      // We use yup to strip not necessary condition values
      // Please read /lib/airbyte/README.md for more information, especially
      // the section: How to remove old condition configuration when user
      // select new one?

      stripValues = formYup.validateSync(fieldValues, {
        abortEarly: false,
        strict: false,
        stripUnknown: true,
      });
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        const errors = {} as AirbyteFieldErrors;
        for (const err of error.inner) {
          if (err.path) {
            const message = err.message.replace(err.path, "This field");
            const pathList = err.path.split(".");

            // Because we are using { configuration: airbyteYup } to
            // construct the yup, yup will add "configuration" as prefix at
            // the start of the path like configuration.tunnel_method, we
            // need to remove the prefix to make it clearner.

            if (pathList[0] === "configuration") {
              pathList.shift();
            }

            const removeConfigurationPrefixPath = pathList.join(".");
            errors[removeConfigurationPrefixPath] = message;
          }
        }
        setFieldErrors(errors);
      }

      return;
    }

    setFieldErrors(null);

    let payload = {} as CreateDestinationPayload;

    // destination-grpc and destination-http come from instill-ai and follow
    // our own payload

    if (
      selectedDestinationDefinition?.connector_definition.docker_repository ===
      "instill-ai/destination-grpc"
    ) {
      payload = {
        id: "destination-grpc",
        destination_connector_definition: `destination-connector-definitions/${
          fieldValues.definition as string
        }`,
        connector: {
          description: fieldValues.description as string,
          configuration: {},
        },
      };
    } else if (
      selectedDestinationDefinition?.connector_definition.docker_repository ===
      "instill-ai/destination-http"
    ) {
      payload = {
        id: "destination-http",
        destination_connector_definition: `destination-connector-definitions/${
          fieldValues.definition as string
        }`,
        connector: {
          description: fieldValues.description as string,
          configuration: {},
        },
      };
    } else {
      payload = {
        id: fieldValues.id as string,
        destination_connector_definition: `destination-connector-definitions/${
          fieldValues.definition as string
        }`,
        connector: {
          description: fieldValues.description as string,
          ...stripValues,
        },
      };
    }

    setMessageBoxState(() => ({
      activate: true,
      status: "progressing",
      description: null,
      message: "Creating...",
    }));

    createDestination.mutate(payload, {
      onSuccess: (newDestination) => {
        setMessageBoxState(() => ({
          activate: true,
          status: "success",
          description: null,
          message: "Succeed.",
        }));
        if (setResult) setResult(newDestination.id);

        if (amplitudeIsInit) {
          sendAmplitudeData("create_destination", {
            type: "critical_action",
            process: "destination",
          });
        }
        if (onSuccessCb) onSuccessCb();
      },
      onError: (error) => {
        if (error instanceof AxiosError) {
          setMessageBoxState(() => ({
            activate: true,
            status: "error",
            description: JSON.stringify(
              error.response?.data.details,
              null,
              "\t"
            ),
            message: error.message,
          }));
        } else {
          setMessageBoxState(() => ({
            activate: true,
            status: "error",
            description: null,
            message: "Something went wrong when create the destination",
          }));
        }
      },
    });
  }, [
    amplitudeIsInit,
    createDestination,
    formYup,
    fieldValues,
    setResult,
    selectedDestinationDefinition,
    onSuccessCb,
  ]);

  const updateFieldValues = useCallback(
    (field: string, value: string) => {
      setFieldValues((prev) => {
        return {
          ...prev,
          [field]: value,
        };
      });
    },
    [setFieldValues]
  );

  return (
    <FormBase
      padding={padding}
      noValidate={true}
      flex1={flex1}
      marginBottom={marginBottom}
    >
      <div className="mb-10 flex flex-col gap-y-5">
        {title}
        <BasicTextField
          id="id"
          label="ID"
          key="id"
          description={
            "Pick a name to help you identify this resource. The ID conforms to RFC-1034, " +
            "which restricts to letters, numbers, and hyphen, with the first character a letter," +
            "the last a letter or a number, and a 63 character maximum."
          }
          required={true}
          disabled={canSetIdField ? false : true}
          additionalMessageOnLabel={
            canSetIdField
              ? null
              : `${selectedDestinationOption?.label} destination's id can only be ${defaultId}`
          }
          value={
            canSetIdField
              ? fieldValues
                ? (fieldValues.id as string) ?? null
                : null
              : defaultId
          }
          error={fieldErrors ? (fieldErrors.id as string) ?? null : null}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateFieldValues("id", event.target.value)
          }
        />

        <BasicTextArea
          id="description"
          label="Description"
          key="description"
          description="Fill with a short description."
          required={false}
          error={
            fieldErrors ? (fieldErrors.description as string) ?? null : null
          }
          value={
            fieldValues ? (fieldValues.description as string) ?? null : null
          }
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            updateFieldValues("description", event.target.value)
          }
        />
        <BasicSingleSelect
          id="definition"
          key="definition"
          instanceId="definition"
          menuPlacement="auto"
          label="Destination type"
          error={
            fieldErrors ? (fieldErrors.definition as string) ?? null : null
          }
          value={selectedDestinationOption}
          options={destinationOptions}
          onChange={(option) => {
            setFieldErrors(null);
            setSelectedDestinationOption(option);
            setSelectedDestinationDefinition(
              destinationDefinitions.data
                ? destinationDefinitions.data.find(
                    (e) => e.name === option?.value
                  ) ?? null
                : null
            );
            setFieldValues((prev) => ({
              id: prev?.id ?? null,
              definition: option?.value ?? null,
            }));
          }}
          description={`<a href='${getSetupGuide()}'>Setup Guide</a>`}
        />
        <AirbyteDestinationFields
          destinationFormTree={destinationFormTree}
          fieldValues={fieldValues}
          setFieldValues={setFieldValues}
          fieldErrors={fieldErrors}
          selectedConditionMap={selectedConditionMap}
          setSelectedConditionMap={setSelectedConditionMap}
          disableAll={false}
          formIsDirty={formIsDirty}
          setFormIsDirty={setFormIsDirty}
        />
      </div>
      <div className="flex flex-row">
        <BasicProgressMessageBox
          state={messageBoxState}
          setState={setMessageBoxState}
          width="w-[25vw]"
          closable={true}
        />
        <SolidButton
          type="button"
          color="primary"
          disabled={selectedDestinationDefinition ? false : true}
          position="ml-auto my-auto"
          onClickHandler={() => submitHandler()}
        >
          Set up
        </SolidButton>
      </div>
    </FormBase>
  );
};

export default CreateDestinationForm;