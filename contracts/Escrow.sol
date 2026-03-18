//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IERC721 {
    function ownerOf(uint256 _id) external view returns (address);

    function transferFrom(
        address _from,
        address _to,
        uint256 _id
    ) external;
}

contract Escrow {
    address public nftAddress;
    address public inspector;
    address public lender;

    modifier onlyInspector() {
        require(msg.sender == inspector, "Only inspector can call this method");
        _;
    }

    modifier onlyLender() {
        require(msg.sender == lender, "Only lender can call this method");
        _;
    }

    modifier onlyParticipant(uint256 _nftID) {
        require(
            msg.sender == buyer[_nftID] ||
                msg.sender == seller[_nftID] ||
                msg.sender == lender,
            "Only participants can call this method"
        );
        _;
    }

    mapping(uint256 => bool) public isListed;
    mapping(uint256 => uint256) public purchasePrice;
    mapping(uint256 => uint256) public escrowAmount;
    mapping(uint256 => uint256) public fundsDeposited;
    mapping(uint256 => address) public buyer;
    mapping(uint256 => address payable) public seller;
    mapping(uint256 => bool) public inspectionPassed;
    mapping(uint256 => mapping(address => bool)) public approval;

    constructor(
        address _nftAddress,
        address _inspector,
        address _lender
    ) {
        nftAddress = _nftAddress;
        inspector = _inspector;
        lender = _lender;
    }

    function list(
        uint256 _nftID,
        uint256 _purchasePrice,
        uint256 _escrowAmount
    ) public {
        require(!isListed[_nftID], "Already listed");
        require(_purchasePrice > 0, "Purchase price must be greater than zero");
        require(
            _escrowAmount > 0 && _escrowAmount <= _purchasePrice,
            "Invalid escrow amount"
        );
        require(
            IERC721(nftAddress).ownerOf(_nftID) == msg.sender,
            "Only owner can list"
        );

        IERC721(nftAddress).transferFrom(msg.sender, address(this), _nftID);

        address previousBuyer = buyer[_nftID];
        address payable previousSeller = seller[_nftID];

        seller[_nftID] = payable(msg.sender);
        buyer[_nftID] = address(0);
        purchasePrice[_nftID] = _purchasePrice;
        escrowAmount[_nftID] = _escrowAmount;
        fundsDeposited[_nftID] = 0;
        inspectionPassed[_nftID] = false;
        isListed[_nftID] = true;

        approval[_nftID][lender] = false;
        approval[_nftID][msg.sender] = false;

        if (previousBuyer != address(0)) {
            approval[_nftID][previousBuyer] = false;
        }

        if (previousSeller != address(0) && previousSeller != msg.sender) {
            approval[_nftID][previousSeller] = false;
        }
    }

    function depositEarnest(uint256 _nftID) public payable {
        require(isListed[_nftID], "Property is not listed");
        require(msg.value > 0, "Deposit must be greater than zero");

        if (buyer[_nftID] == address(0)) {
            buyer[_nftID] = msg.sender;
        } else {
            require(
                msg.sender == buyer[_nftID],
                "Only assigned buyer can deposit"
            );
        }

        require(
            fundsDeposited[_nftID] + msg.value <= purchasePrice[_nftID],
            "Deposit exceeds purchase price"
        );
        require(
            fundsDeposited[_nftID] + msg.value >= escrowAmount[_nftID],
            "Insufficient earnest amount"
        );

        fundsDeposited[_nftID] += msg.value;
        approval[_nftID][msg.sender] = true;
    }

    function updateInspectionStatus(uint256 _nftID, bool _passed)
        public
        onlyInspector
    {
        require(isListed[_nftID], "Property is not listed");
        inspectionPassed[_nftID] = _passed;
    }

    function approveSale(uint256 _nftID) public onlyParticipant(_nftID) {
        require(buyer[_nftID] != address(0), "Buyer not assigned");
        approval[_nftID][msg.sender] = true;
    }

    function fundSale(uint256 _nftID) public payable onlyLender {
        require(isListed[_nftID], "Property is not listed");
        require(buyer[_nftID] != address(0), "Buyer not assigned");

        uint256 remainingBalance = purchasePrice[_nftID] -
            fundsDeposited[_nftID];

        require(remainingBalance > 0, "Sale already fully funded");
        require(msg.value == remainingBalance, "Incorrect funding amount");

        fundsDeposited[_nftID] += msg.value;
        approval[_nftID][msg.sender] = true;
    }

    function buyNow(uint256 _nftID) public payable {
        require(isListed[_nftID], "Property is not listed");
        require(buyer[_nftID] == address(0), "Property already reserved");
        require(msg.value == purchasePrice[_nftID], "Incorrect purchase amount");

        buyer[_nftID] = msg.sender;
        approval[_nftID][msg.sender] = true;
        fundsDeposited[_nftID] = msg.value;
        inspectionPassed[_nftID] = true;
        approval[_nftID][lender] = true;
        approval[_nftID][seller[_nftID]] = true;

        isListed[_nftID] = false;

        uint256 amount = fundsDeposited[_nftID];
        address payable propertySeller = seller[_nftID];
        address propertyBuyer = buyer[_nftID];

        fundsDeposited[_nftID] = 0;

        (bool success, ) = propertySeller.call{value: amount}("");
        require(success, "Transfer to seller failed");

        IERC721(nftAddress).transferFrom(address(this), propertyBuyer, _nftID);
    }

    function finalizeSale(uint256 _nftID) public {
        require(isListed[_nftID], "Property is not listed");
        require(buyer[_nftID] != address(0), "Buyer not assigned");
        require(inspectionPassed[_nftID], "Inspection not passed");
        require(approval[_nftID][buyer[_nftID]], "Buyer must approve sale");
        require(approval[_nftID][seller[_nftID]], "Seller must approve sale");
        require(approval[_nftID][lender], "Lender must approve sale");
        require(
            fundsDeposited[_nftID] >= purchasePrice[_nftID],
            "Insufficient sale funds"
        );

        isListed[_nftID] = false;

        uint256 amount = fundsDeposited[_nftID];
        address payable propertySeller = seller[_nftID];
        address propertyBuyer = buyer[_nftID];

        fundsDeposited[_nftID] = 0;

        (bool success, ) = propertySeller.call{value: amount}("");
        require(success, "Transfer to seller failed");

        IERC721(nftAddress).transferFrom(address(this), propertyBuyer, _nftID);
    }

    function cancelSale(uint256 _nftID) public {
        require(isListed[_nftID], "Property is not listed");
        require(
            msg.sender == seller[_nftID] ||
                msg.sender == buyer[_nftID] ||
                msg.sender == inspector,
            "Only seller, buyer, or inspector can cancel"
        );

        bool passed = inspectionPassed[_nftID];
        uint256 amount = fundsDeposited[_nftID];
        address propertyBuyer = buyer[_nftID];
        address payable propertySeller = seller[_nftID];

        isListed[_nftID] = false;
        inspectionPassed[_nftID] = false;
        fundsDeposited[_nftID] = 0;

        approval[_nftID][lender] = false;
        approval[_nftID][propertySeller] = false;

        if (propertyBuyer != address(0)) {
            approval[_nftID][propertyBuyer] = false;
            buyer[_nftID] = address(0);
        }

        if (amount > 0) {
            if (!passed && propertyBuyer != address(0)) {
                payable(propertyBuyer).transfer(amount);
            } else {
                propertySeller.transfer(amount);
            }
        }

        IERC721(nftAddress).transferFrom(address(this), propertySeller, _nftID);
    }

    receive() external payable {}

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
