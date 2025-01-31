import { Logo } from "@instill-ai/design-system";
import {
  DashboardPipelineListPageMainView,
  PageBase,
  Topbar,
} from "@instill-ai/toolkit";

import { ConsoleCorePageHead, Sidebar } from "../../../components";
import { NextPageWithLayout } from "../../_app";
import { useAccessToken } from "../../../lib/useAccessToken";

const PipelinePage: NextPageWithLayout = () => {
  const accessToken = useAccessToken();
  return (
    <>
      <ConsoleCorePageHead title="dashboard" />
      <DashboardPipelineListPageMainView
        accessToken={accessToken.isSuccess ? accessToken.data : null}
        enableQuery={accessToken.isSuccess}
      />
    </>
  );
};

PipelinePage.getLayout = (page) => {
  return (
    <PageBase>
      <Topbar logo={<Logo variant="colourLogomark" width={38} />} />
      <PageBase.Container>
        <Sidebar />
        <PageBase.Content contentPadding="py-8 px-16">{page}</PageBase.Content>
      </PageBase.Container>
    </PageBase>
  );
};

export default PipelinePage;
